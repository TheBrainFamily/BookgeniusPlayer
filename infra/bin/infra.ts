#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { WebStack } from "../lib/web-stack.js";

const app = new cdk.App();

// Required:
const DOMAIN_PROD = process.env.DOMAIN_PROD; // e.g. bookgenius.net
const CF_PRIVATE_KEY_SECRET_NAME = process.env.CF_PRIVATE_KEY_SECRET_NAME || "bookgenius/cf/privateKey";

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
});
