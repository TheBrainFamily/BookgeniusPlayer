#!/usr/bin/env node
import "source-map-support/register.js";
import "dotenv/config";
import * as cdk from "aws-cdk-lib";
import { WebStack } from "../lib/web-stack.js";
import { ApiEuStack } from "../lib/api-eu-stack.js";
import { AnswerServerStack } from "../lib/answer-server-stack.js";

const app = new cdk.App();

// Required:
const DOMAIN_PROD = process.env.DOMAIN_PROD; // e.g. bookgenius.net
const CF_PRIVATE_KEY_SECRET_NAME = process.env.CF_PRIVATE_KEY_SECRET_NAME || "bookgenius/cf/privateKey";

const GEMINI_KEY = process.env.GEMINI_KEY;
if (!GEMINI_KEY) throw new Error("Set env GEMINI_KEY");

// Optional:
const DOMAIN_STAGE = process.env.DOMAIN_STAGE; // e.g. bookgenius.eu (for branches)
const TOKEN_TTL_SECONDS = Number(process.env.TOKEN_TTL_SECONDS || 21600);

if (!DOMAIN_PROD) throw new Error("Set env DOMAIN_PROD");
if (!CF_PRIVATE_KEY_SECRET_NAME) throw new Error("Set env CF_PRIVATE_KEY_SECRET_NAME");

new WebStack(app, "WebStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-1", // CloudFront certs must be in us-east-1
  },
  domainProd: DOMAIN_PROD,
  domainStage: DOMAIN_STAGE,
  cfPrivateKeySecretName: CF_PRIVATE_KEY_SECRET_NAME,
  tokenTtlSeconds: TOKEN_TTL_SECONDS,
  publicKeyFilePath: "cf-public-key.pem",
  clerkSecretKey: process.env.CLERK_SECRET_KEY!,
});

new ApiEuStack(app, "ApiEuStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "eu-central-1" },
  domainProd: process.env.DOMAIN_PROD!, // e.g. bookgenius.eu
  bucketName: process.env.CONTENT_BUCKET_NAME!, // from your WebStack output
  cfPrivateKeySecretName: CF_PRIVATE_KEY_SECRET_NAME!, // must exist in eu-central-1
  clerkSecretKey: process.env.CLERK_SECRET_KEY!,
  tokenTtlSeconds: Number(process.env.TOKEN_TTL_SECONDS || 21600),
});

new AnswerServerStack(app, "AnswerServerStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "eu-central-1" },
  domain: process.env.DOMAIN_PROD!, // e.g. "bookgenius.eu"
  subdomain: "answers",
  bucketName: process.env.CONTENT_BUCKET_NAME!,
  geminiSecret: GEMINI_KEY!,
  s3Region: "us-east-1",
});
