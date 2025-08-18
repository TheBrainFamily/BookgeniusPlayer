import * as path from "path";
import {
  Stack,
  StackProps,
  Duration,
  aws_s3 as s3,
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_certificatemanager as acm,
  aws_apigatewayv2 as apigwv2,
  aws_apigatewayv2_integrations as apigwv2i,
  aws_lambda_nodejs as lnode,
  aws_lambda as lambda,
  aws_secretsmanager as secrets,
  aws_iam as iam,
  CfnOutput,
} from "aws-cdk-lib";
import { Construct } from "constructs";

export interface ApiEuStackProps extends StackProps {
  domainProd: string; // e.g. bookgenius.eu
  bucketName: string; // your existing bucket name (from outputs)
  cfPrivateKeySecretName: string; // name of secret with PRIVATE key (replicated to eu-central-1)
  clerkSecretKey: string;
  tokenTtlSeconds: number;
}

export class ApiEuStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiEuStackProps) {
    super(scope, id, props);

    const zone = route53.HostedZone.fromLookup(this, "Zone", { domainName: props.domainProd });

    // ACM cert in eu-central-1 for api-eu.<domain>
    const certApiEu = new acm.DnsValidatedCertificate(this, "ApiEuCert", { domainName: `api-eu.${props.domainProd}`, hostedZone: zone, region: "eu-central-1" });

    // Import existing content bucket by name (bucket stays where it is)

    // Lambda in eu-central-1 running your resolver
    const resolveFnEu = new lnode.NodejsFunction(this, "ResolveFnEu", {
      entry: path.resolve("dist/runtime/resolve-lambda.js"),
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1536,
      timeout: Duration.seconds(10),
      environment: {
        BUCKET: props.bucketName,
        DEFAULT_CTX: "prod",
        VERSIONS_ROOT: "branches",
        CDN_DOMAIN: `cdn.${props.domainProd}`,
        TOKEN_TTL_SECONDS: String(props.tokenTtlSeconds),
        CLERK_SECRET_KEY: props.clerkSecretKey,
        BUCKET_REGION: "us-east-1",
      },
    });

    // Inject PRIVATE key PEM from Secrets Manager (secret must exist in eu-central-1)
    const cfPrivEu = secrets.Secret.fromSecretNameV2(this, "CfPrivEu", props.cfPrivateKeySecretName);
    resolveFnEu.addEnvironment("CF_PRIVATE_KEY_PEM", cfPrivEu.secretValue.unsafeUnwrap());

    // Minimal IAM for versions.json reads
    resolveFnEu.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`arn:aws:s3:::${props.bucketName}/prod/versions.json`, `arn:aws:s3:::${props.bucketName}/branches/*/versions.json`],
      }),
    );

    // HTTP API in eu-central-1
    const apiEu = new apigwv2.HttpApi(this, "CoreHttpApiEu", {
      apiName: "core-api-eu",
      corsPreflight: {
        allowOrigins: [`https://${props.domainProd}`],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ["Authorization", "Content-Type"],
        allowCredentials: true,
      },
    });

    apiEu.addRoutes({ path: "/content/resolve/{slug}", methods: [apigwv2.HttpMethod.GET], integration: new apigwv2i.HttpLambdaIntegration("ResolveIntegrationEu", resolveFnEu) });

    // Custom domain api-eu.<domain>
    const apiDomainEu = new apigwv2.DomainName(this, "ApiDomainEu", { domainName: `api-eu.${props.domainProd}`, certificate: certApiEu });

    new apigwv2.ApiMapping(this, "ApiMappingEu", { api: apiEu, domainName: apiDomainEu, stage: apiEu.defaultStage! });

    const certApiEuMain = new acm.DnsValidatedCertificate(this, "ApiEuMainCert", { domainName: `api.${props.domainProd}`, hostedZone: zone, region: "eu-central-1" });

    const apiDomainEuMain = new apigwv2.DomainName(this, "ApiDomainEuMain", { domainName: `api.${props.domainProd}`, certificate: certApiEuMain });

    new apigwv2.ApiMapping(this, "ApiMappingEuMain", { api: apiEu, domainName: apiDomainEuMain, stage: apiEu.defaultStage! });

    // Latency alias record for api.bookgenius.eu -> EU regional API domain
    new route53.CfnRecordSet(this, "ApiLatencyEu", {
      hostedZoneId: zone.hostedZoneId,
      name: `api.${props.domainProd}`,
      type: "A",
      setIdentifier: "api-eu-central-1",
      region: "eu-central-1",
      aliasTarget: { dnsName: apiDomainEuMain.regionalDomainName, hostedZoneId: apiDomainEuMain.regionalHostedZoneId, evaluateTargetHealth: false },
    });

    const fnUrlEu = resolveFnEu.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });

    new route53.ARecord(this, "ApiEuDirectAlias", {
      zone,
      recordName: `api-eu.${props.domainProd}`,
      target: route53.RecordTarget.fromAlias(new targets.ApiGatewayv2DomainProperties(apiDomainEu.regionalDomainName, apiDomainEu.regionalHostedZoneId)),
    });

    new CfnOutput(this, "FnUrlEu", { value: fnUrlEu.url });
  }
}
