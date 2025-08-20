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
const DOMAIN = process.env.DOMAIN; // e.g. bookgenius.net
const CF_PRIVATE_KEY_SECRET_NAME = process.env.CF_PRIVATE_KEY_SECRET_NAME || "bookgenius/cf/privateKey";

const GEMINI_KEY = process.env.GEMINI_KEY;
if (!GEMINI_KEY) throw new Error("Set env GEMINI_KEY");

// Optional:
const TOKEN_TTL_SECONDS = Number(process.env.TOKEN_TTL_SECONDS || 21600);

if (!DOMAIN) throw new Error("Set env DOMAIN_PROD");
if (!CF_PRIVATE_KEY_SECRET_NAME) throw new Error("Set env CF_PRIVATE_KEY_SECRET_NAME");

const jwtPEM = fs.readFileSync(path.resolve("jwt-public-key.pem"), "utf8");
if (!jwtPEM || jwtPEM.trim() === "") {
  throw new Error("JWT public key is empty");
}

new WebStack(app, "WebStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-1", // CloudFront certs must be in us-east-1
  },
  domainProd: DOMAIN,
  cfPrivateKeySecretName: CF_PRIVATE_KEY_SECRET_NAME,
  tokenTtlSeconds: TOKEN_TTL_SECONDS,
  publicKeyFilePath: "cf-public-key.pem",
  clerkSecretKey: process.env.CLERK_SECRET_KEY!,
  jwtPublicKey: jwtPEM,
});

new ApiEuStack(app, "ApiEuStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "eu-central-1" },
  domainProd: DOMAIN, // e.g. bookgenius.eu
  bucketName: process.env.CONTENT_BUCKET_NAME!, // from your WebStack output
  cfPrivateKeySecretName: CF_PRIVATE_KEY_SECRET_NAME!, // must exist in eu-central-1
  clerkSecretKey: process.env.CLERK_SECRET_KEY!,
  jwtPublicKey: jwtPEM,
  tokenTtlSeconds: Number(process.env.TOKEN_TTL_SECONDS || 21600),
});

new AnswerServerStack(app, "AnswerServerStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "eu-central-1" },
  domain: DOMAIN, // e.g. "bookgenius.eu"
  subdomain: "answers",
  bucketName: process.env.CONTENT_BUCKET_NAME!,
  geminiSecret: GEMINI_KEY!,
  s3Region: "us-east-1",
  jwtPublicKey: jwtPEM,
});
