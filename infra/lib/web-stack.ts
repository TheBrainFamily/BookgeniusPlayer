import * as fs from "fs";
import * as path from "path";
import {
  Stack,
  StackProps,
  Duration,
  RemovalPolicy,
  CfnOutput,
  Fn,
  aws_s3 as s3,
  aws_cloudfront as cf,
  aws_cloudfront_origins as origins,
  aws_iam as iam,
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_certificatemanager as acm,
  aws_apigatewayv2 as apigwv2,
  aws_apigatewayv2_integrations as apigwv2i,
  aws_lambda_nodejs as lnode,
  aws_lambda as lambda,
  aws_secretsmanager as secrets,
} from "aws-cdk-lib";
import { Construct } from "constructs";

export interface WebStackProps extends StackProps {
  domainProd: string;
  domainStage?: string;
  publicKeyFilePath: string;
  cfPrivateKeySecretName: string;
  tokenTtlSeconds: number;
  clerkSecretKey: string;
  jwtPublicKey: string;
}

export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    // ===== Hosted Zones =====
    const zoneProd = route53.HostedZone.fromLookup(this, "ZoneProd", { domainName: props.domainProd });

    // ===== Certificates (us-east-1) =====
    const certAppProd = new acm.DnsValidatedCertificate(this, "AppCertProd", {
      domainName: props.domainProd,
      subjectAlternativeNames: [`*.${props.domainProd}`],
      hostedZone: zoneProd,
      region: "us-east-1",
    });
    const certCdn = new acm.DnsValidatedCertificate(this, "CdnCert", { domainName: `cdn.${props.domainProd}`, hostedZone: zoneProd, region: "us-east-1" });
    const certApiProd = new acm.DnsValidatedCertificate(this, "ApiCertProd", { domainName: `api.${props.domainProd}`, hostedZone: zoneProd, region: "us-east-1" });

    // ===== S3 bucket (private) =====
    const bucket = new s3.Bucket(this, "ContentBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // OAIs
    const oaiAppProd = new cf.OriginAccessIdentity(this, "OaiAppProd");
    const oaiCdn = new cf.OriginAccessIdentity(this, "OaiCdn");

    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [bucket.arnForObjects("*")],
        principals: [new iam.CanonicalUserPrincipal(oaiAppProd.cloudFrontOriginAccessIdentityS3CanonicalUserId)],
      }),
    );
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [bucket.arnForObjects("*")],
        principals: [new iam.CanonicalUserPrincipal(oaiCdn.cloudFrontOriginAccessIdentityS3CanonicalUserId)],
      }),
    );
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowCloudFrontOACReadFromThisAccount",
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject"],
        resources: [bucket.arnForObjects("*")],
        principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
        conditions: { StringEquals: { "AWS:SourceAccount": this.account }, StringLike: { "AWS:SourceArn": `arn:aws:cloudfront::${this.account}:distribution/*` } },
      }),
    );

    // ===== CloudFront Function: Router (loaded from file, compiled to JS) =====
    const routerFn = new cf.Function(this, "RouterFn", {
      code: cf.FunctionCode.fromFile({ filePath: path.resolve("dist-cff/router-fn.js") }),
      runtime: cf.FunctionRuntime.JS_2_0, // <— modern features enabled
    });

    // ===== /resolve Lambda (created early for Function URLs) =====
    const pubPem = fs.readFileSync(path.resolve(props.publicKeyFilePath), "utf8");
    const publicKey = new cf.PublicKey(this, "CfPublicKey", { encodedKey: pubPem });

    const resolveFn = new lnode.NodejsFunction(this, "ResolveFn", {
      entry: path.resolve("dist/runtime/resolve-lambda.js"),
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1536,
      timeout: Duration.seconds(10),
      environment: {
        BUCKET: bucket.bucketName,
        DEFAULT_CTX: "prod",
        VERSIONS_ROOT: "branches",
        CDN_DOMAIN: `cdn.${props.domainProd}`,
        TOKEN_TTL_SECONDS: String(props.tokenTtlSeconds),
        CF_PRIVATE_KEY_SECRET_NAME: props.cfPrivateKeySecretName,
        CLERK_SECRET_KEY: props.clerkSecretKey,
        TOKEN_PUBLIC_KEY: props.jwtPublicKey,
        CF_PUBLIC_KEY_ID: publicKey.publicKeyId,
      },
    });

    const cfPriv = secrets.Secret.fromSecretNameV2(this, "CfPrivateKeySecret", props.cfPrivateKeySecretName);
    resolveFn.addEnvironment("CF_PRIVATE_KEY_PEM", cfPriv.secretValue.unsafeUnwrap());
    resolveFn.addEnvironment("AWS_NODEJS_CONNECTION_REUSE_ENABLED", "1");

    resolveFn.addToRolePolicy(
      new iam.PolicyStatement({ actions: ["s3:GetObject"], resources: [bucket.arnForObjects("prod/versions.json"), bucket.arnForObjects("branches/*/versions.json")] }),
    );

    resolveFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: ["*"], // tighten to that secret ARN later
      }),
    );

    // Function URL to use as /api/* origin
    const fnUrlProd = resolveFn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });
    // Extract hostname from the Function URL using CloudFormation functions
    // URL format: https://<url-id>.lambda-url.<region>.on.aws/
    const fnOriginHostProd = Fn.select(2, Fn.split("/", fnUrlProd.url));

    // ===== App Distribution (PROD) =====
    const appDistProd = new cf.Distribution(this, "AppDistProd", {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket, { originAccessIdentity: oaiAppProd }),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{ function: routerFn, eventType: cf.FunctionEventType.VIEWER_REQUEST }],
      },
      priceClass: cf.PriceClass.PRICE_CLASS_100,
      domainNames: [props.domainProd, `*.${props.domainProd}`],
      certificate: certAppProd,
    });

    const fnOriginProd = new origins.HttpOrigin(fnOriginHostProd, { protocolPolicy: cf.OriginProtocolPolicy.HTTPS_ONLY, originSslProtocols: [cf.OriginSslPolicy.TLS_V1_2] });
    appDistProd.addBehavior("/api/*", fnOriginProd, {
      cachePolicy: cf.CachePolicy.CACHING_DISABLED, // This forwards Authorization header
      originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER, // Forwards all headers except Host
      allowedMethods: cf.AllowedMethods.ALLOW_ALL,
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      functionAssociations: [{ function: routerFn, eventType: cf.FunctionEventType.VIEWER_REQUEST }],
    });

    // DNS for PROD app
    new route53.ARecord(this, "ApexProd", { zone: zoneProd, recordName: props.domainProd, target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(appDistProd)) });
    new route53.ARecord(this, "WildcardProd", {
      zone: zoneProd,
      recordName: `*.${props.domainProd}`,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(appDistProd)),
    });

    // ===== CDN for book assets (Signed URLs; tokens ignored in cache key) =====
    const keyGroup = new cf.KeyGroup(this, "CfKeyGroup", { items: [publicKey] });

    const longCacheNoQs = new cf.CachePolicy(this, "LongCacheNoQs", {
      defaultTtl: Duration.days(365),
      maxTtl: Duration.days(365),
      minTtl: Duration.days(1),
      cookieBehavior: cf.CacheCookieBehavior.none(),
      headerBehavior: cf.CacheHeaderBehavior.none(),
      queryStringBehavior: cf.CacheQueryStringBehavior.none(), // IMPORTANT
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true,
    });

    const noQsToOrigin = new cf.OriginRequestPolicy(this, "NoQsToOrigin", {
      queryStringBehavior: cf.OriginRequestQueryStringBehavior.none(),
      cookieBehavior: cf.OriginRequestCookieBehavior.none(),
      headerBehavior: cf.OriginRequestHeaderBehavior.none(),
    });

    // CORS for module/script/image fetches from CDN
    const corsPolicy = new cf.ResponseHeadersPolicy(this, "CdnCors", {
      corsBehavior: {
        accessControlAllowCredentials: false,
        accessControlAllowHeaders: ["*"],
        accessControlAllowMethods: ["GET", "HEAD", "OPTIONS"],
        accessControlAllowOrigins: ["*"],
        accessControlExposeHeaders: ["Content-Length", "Content-Type", "ETag"],
        originOverride: true,
      },
    });

    const cdnDist = new cf.Distribution(this, "CdnDist", {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket, { originAccessIdentity: oaiCdn }),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        trustedKeyGroups: [keyGroup],
        cachePolicy: longCacheNoQs,
        originRequestPolicy: noQsToOrigin,
        responseHeadersPolicy: corsPolicy,
      },
      priceClass: cf.PriceClass.PRICE_CLASS_100,
      domainNames: [`cdn.${props.domainProd}`],
      certificate: certCdn,
    });

    new route53.ARecord(this, "CdnAlias", { zone: zoneProd, recordName: `cdn.${props.domainProd}`, target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(cdnDist)) });

    // HTTP API (v2) for PROD
    const apiDomainProd = new apigwv2.DomainName(this, "ApiDomainProd", { domainName: `api.${props.domainProd}`, certificate: certApiProd });

    const httpApiProd = new apigwv2.HttpApi(this, "CoreHttpApiProd", {
      apiName: "core-api-prod",
      corsPreflight: { allowOrigins: ["*"], allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.OPTIONS], allowHeaders: ["*"] },
    });

    // Map $default stage to the custom domain
    new apigwv2.ApiMapping(this, "ApiMappingProd", { api: httpApiProd, domainName: apiDomainProd, stage: httpApiProd.defaultStage! });

    // Route: GET /content/resolve/{slug}
    httpApiProd.addRoutes({
      path: "/content/resolve/{slug}",
      methods: [apigwv2.HttpMethod.GET],
      integration: new apigwv2i.HttpLambdaIntegration("ResolveIntegrationProd", resolveFn),
    });

    // Route53 alias for api.<domain>
    new route53.CfnRecordSet(this, "ApiLatencyUs", {
      hostedZoneId: zoneProd.hostedZoneId,
      name: `api.${props.domainProd}`,
      type: "A",
      setIdentifier: "api-us-east-1",
      region: "us-east-1",
      aliasTarget: { dnsName: apiDomainProd.regionalDomainName, hostedZoneId: apiDomainProd.regionalHostedZoneId, evaluateTargetHealth: false },
    });

    // ===== Outputs =====
    new CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new CfnOutput(this, "AppProdDomain", { value: props.domainProd });
    new CfnOutput(this, "CdnDomain", { value: `cdn.${props.domainProd}` });
    new CfnOutput(this, "ApiProd", { value: `api.${props.domainProd}` });
  }
}
