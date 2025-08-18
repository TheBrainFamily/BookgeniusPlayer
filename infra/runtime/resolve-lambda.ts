import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import * as crypto from 'crypto';
import type { StreamingBlobPayloadOutputTypes } from '@smithy/types';

const s3 = new S3Client({});
const sm = new SecretsManagerClient({});

const {
  BUCKET,
  DEFAULT_CTX = 'prod',
  VERSIONS_ROOT = 'branches',
  CDN_DOMAIN,
  TOKEN_TTL_SECONDS = '21600',
  CF_PRIVATE_KEY_SECRET_NAME
} = process.env;

function hostToBranch(host?: string): string | undefined {
  if (!host) return;
  const h = host.split(':')[0];
  const first = h.split('.')[0];
  if (/^pr-/.test(first)) return first;
}

async function streamToString(stream: StreamingBlobPayloadOutputTypes): Promise<string> {
  return await new Promise((resolve, reject) => {
    let data = '';
    stream.setEncoding('utf-8');
    stream.on('data', (c: string) => (data += c));
    stream.on('end', () => resolve(data));
    stream.on('error', reject);
  });
}

async function getVersions(ctx: string): Promise<Record<string, string> | null> {
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET!, Key: `${ctx}/versions.json` }));
    if (!out.Body) return null;
    const txt = await streamToString(out.Body);
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function buildPolicy(prefixUrl: string, expires: number) {
  return {
    Statement: [
      { Resource: `${prefixUrl}*`, Condition: { 'DateLessThan': { 'AWS:EpochTime': expires } } }
    ]
  };
}
function b64url(s: string) {
  return Buffer.from(s).toString('base64')
    .replace(/\+/g, '-').replace(/=/g, '_').replace(/\//g, '~');
}
function signPolicy(policyJson: string, privateKeyPem: string) {
  const signer = crypto.createSign('RSA-SHA1'); // CloudFront signed URL uses RSA-SHA1
  signer.update(policyJson);
  return signer.sign(privateKeyPem, 'base64')
    .replace(/\+/g, '-').replace(/=/g, '_').replace(/\//g, '~');
}

export const handler = async (event: any) => {
  try {
    const slug = decodeURIComponent(event.pathParameters?.slug || '');
    if (!slug) return res(400, { error: 'slug required' });

    const qs = event.queryStringParameters || {};
    let ctx: string | undefined = qs.ctx; // "prod" or "branches/<branch>"

    if (!ctx) {
      const host = event.headers?.host || event.headers?.Host;
      const branch = hostToBranch(host);
      ctx = branch ? `${VERSIONS_ROOT}/${branch}` : DEFAULT_CTX;
    }

    const isLoggedIn = !!(event.headers?.authorization || event.headers?.Authorization);
    const visibility = isLoggedIn ? 'full' : 'demo';

    let versions = await getVersions(ctx!);
    let ctxUsed = ctx!;
    if (!versions) {
      versions = await getVersions(DEFAULT_CTX);
      ctxUsed = DEFAULT_CTX;
    }
    if (!versions) return res(503, { error: 'versions_unavailable' });

    const version = versions[slug];
    if (!version) return res(404, { error: 'version_not_found' });

    const baseFolder =
      visibility === 'demo'
        ? `/${ctxUsed}/assets/books/${slug}/demo/${version}/`
        : `/${ctxUsed}/assets/books/${slug}/${version}/`;

    const expires = Math.floor(Date.now() / 1000) + parseInt(TOKEN_TTL_SECONDS!, 10);
    const prefixUrl = `https://${CDN_DOMAIN}${baseFolder}`.replace(/\/+$/, '/');

    // get private key
    const secret = await sm.send(new GetSecretValueCommand({ SecretId: CF_PRIVATE_KEY_SECRET_NAME! }));
    const privateKeyPem = secret.SecretString!;
    const policyJson = JSON.stringify(buildPolicy(prefixUrl, expires));
    const policyB64 = b64url(policyJson);
    const signature = signPolicy(policyJson, privateKeyPem);

    const assetPrefix = prefixUrl.replace(/\/+$/, '');
    const assetQuery = `Policy=${policyB64}&Signature=${signature}&Key-Pair-Id=${encodeURIComponent('<Key-Pair-Id>')}`;
    // Note: we do NOT include Key-Pair-Id here; for KeyGroup keys you don't need Key-Pair-Id param.
    // If you prefer explicit param, add a separate env for PublicKeyId and include it.

    const preload = [
      `${assetPrefix}/compiled/bookData.js?${assetQuery}`
    ];

    return res(200, { slug, version, visibility, ctxUsed, assetPrefix, assetQuery, preload });
  } catch (e) {
    console.error(e);
    return res(500, { error: 'internal_error' });
  }
};

function res(statusCode: number, body: Record<string, unknown>) {
    return {
        statusCode,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'access-control-allow-origin': '*',
            'cache-control': 'private, no-store, no-cache, must-revalidate',
            'pragma': 'no-cache',
            'expires': '0',
            'vary': 'Authorization'
        },
        body: JSON.stringify(body)
    };
}