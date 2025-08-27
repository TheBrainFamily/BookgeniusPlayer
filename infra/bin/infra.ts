#!/usr/bin/env node
import "source-map-support/register.js";
import "dotenv/config";
import * as cdk from "aws-cdk-lib";
import { WebStack } from "../lib/web-stack.js";
import { ApiEuStack } from "../lib/api-eu-stack.js";
import { AnswerServerStack } from "../lib/answer-server-stack.js";
import fs from "fs";
import path from "path";

const app = new cdk.App();

// Required:
const DOMAIN = process.env.DOMAIN!; // e.g. bookgenius.net
const CDK_DEFAULT_ACCOUNT = process.env.CDK_DEFAULT_ACCOUNT;
const CF_PRIVATE_KEY_SECRET_NAME = process.env.CF_PRIVATE_KEY_SECRET_NAME || "bookgenius/cf/privateKey";
const JWT_PRIVATE_KEY_SECRET_NAME = process.env.JWT_PRIVATE_KEY_SECRET_NAME || "bookgenius/jwt/privateKey";
const PUBLIC_JWT_KEY_NAME = process.env.PUBLIC_JWT_KEY_NAME;
const PUBLIC_CF_KEY_NAME = process.env.PUBLIC_CF_KEY_NAME;
const CONTENT_BUCKET_NAME = process.env.CONTENT_BUCKET_NAME || `webcontent.${DOMAIN}`;
const ANSWER_SERVER_STACK_REGION = process.env.ANSWER_SERVER_STACK_REGION || "eu-central-1";
const isStaging = process.env.DOMAIN?.includes("branches") ?? false;
const GEMINI_KEY = process.env.GEMINI_KEY;
if (!GEMINI_KEY) throw new Error("Set env GEMINI_KEY");
if (!DOMAIN) throw new Error("Set env DOMAIN");
if (!CDK_DEFAULT_ACCOUNT) throw new Error("Set env CDK_DEFAULT_ACCOUNT, you can get it from `aws sts get-caller-identity --query Account --output text`");

const domainSlug = DOMAIN.replace(/\./g, "-");
const suffix = `${domainSlug}${isStaging ? "-stg" : ""}`;

// Optional:
const TOKEN_TTL_SECONDS = Number(process.env.TOKEN_TTL_SECONDS || 21600);

if (!DOMAIN) throw new Error("Set env DOMAIN_PROD");
if (!CF_PRIVATE_KEY_SECRET_NAME) throw new Error("Set env CF_PRIVATE_KEY_SECRET_NAME");
if (!JWT_PRIVATE_KEY_SECRET_NAME) throw new Error("Set env JWT_PRIVATE_KEY_SECRET_NAME");
if (!PUBLIC_JWT_KEY_NAME) throw new Error("Set env PUBLIC_JWT_KEY_NAME");
if (!PUBLIC_CF_KEY_NAME) throw new Error("Set env PUBLIC_CF_KEY_NAME");
if (!CONTENT_BUCKET_NAME) throw new Error("Set env CONTENT_BUCKET_NAME");

const jwtPEM = fs.readFileSync(path.resolve(PUBLIC_JWT_KEY_NAME), "utf8");
if (!jwtPEM || jwtPEM.trim() === "") {
  throw new Error("JWT public key is empty");
}

const webStack = new WebStack(app, `WebStack-${suffix}`, {
  env: {
    account: CDK_DEFAULT_ACCOUNT,
    region: "us-east-1", // CloudFront certs must be in us-east-1
  },
  domainProd: DOMAIN,
  cfPrivateKeySecretName: CF_PRIVATE_KEY_SECRET_NAME,
  jwtPrivateKeySecretName: JWT_PRIVATE_KEY_SECRET_NAME,
  tokenTtlSeconds: TOKEN_TTL_SECONDS,
  publicKeyFilePath: PUBLIC_CF_KEY_NAME,
  clerkSecretKey: process.env.CLERK_SECRET_KEY!,
  jwtPublicKey: jwtPEM,
  bucketName: CONTENT_BUCKET_NAME,
  isStaging,
});

// new ApiEuStack(app, `ApiEuStack-${suffix}`, {
//   env: { account: CDK_DEFAULT_ACCOUNT, region: "eu-central-1" },
//   domain: DOMAIN, // e.g. bookgenius.eu
//   bucketName: CONTENT_BUCKET_NAME!, // from your WebStack output
//   cfPrivateKeySecretName: CF_PRIVATE_KEY_SECRET_NAME!, // must exist in eu-central-1
//   clerkSecretKey: process.env.CLERK_SECRET_KEY!,
//   jwtPublicKey: jwtPEM,
//   tokenTtlSeconds: Number(process.env.TOKEN_TTL_SECONDS || 21600),
// });

const answerStack = new AnswerServerStack(app, `AnswerServerStack-${suffix}`, {
  env: { account: CDK_DEFAULT_ACCOUNT, region: ANSWER_SERVER_STACK_REGION },
  domain: DOMAIN, // e.g. "bookgenius.eu"
  subdomain: "answers",
  bucketName: CONTENT_BUCKET_NAME!,
  geminiSecret: GEMINI_KEY!,
  s3Region: "us-east-1",
  jwtPublicKey: jwtPEM,
});

answerStack.addDependency(webStack);