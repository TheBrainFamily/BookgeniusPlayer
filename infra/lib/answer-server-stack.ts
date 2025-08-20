import * as path from "path";
import {
  Stack,
  StackProps,
  Duration,
  CfnParameter,
  CfnOutput,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecs_patterns as ecsPatterns,
  aws_ecr_assets as ecrAssets,
  aws_route53 as route53,
  aws_certificatemanager as acm,
  aws_logs as logs,
  aws_iam as iam,
  aws_route53_targets as targets,
  aws_secretsmanager as secrets,
} from "aws-cdk-lib";
import { Construct } from "constructs";

export interface AnswerServerStackProps extends StackProps {
  domain: string;
  subdomain?: string;
  geminiApiKeySecretName?: string; // <- made optional
  bucketName?: string;
  s3Region?: string;
  geminiSecret: string;
  jwtPublicKey: string;
  hostedZoneId?: string;
}

export class AnswerServerStack extends Stack {
  constructor(scope: Construct, id: string, props: AnswerServerStackProps) {
    super(scope, id, props);

    // -- rest of your stack (VPC/cluster/etc) --
    const fqdn = `${props.subdomain ?? "answers"}.${props.domain}`;
    const apex = props.domain.split(".").slice(-2).join("."); // e.g. "staging.bookgenius.eu" -> "bookgenius.eu"
    const zone = route53.HostedZone.fromLookup(this, "Zone", { domainName: apex });

    const vpc = new ec2.Vpc(this, "Vpc", { maxAzs: 2, natGateways: 1 });
    const cluster = new ecs.Cluster(this, "Cluster", { vpc });

    // Build minimal image from the Dockerfile above
    const imageAsset = new ecrAssets.DockerImageAsset(this, "AnswerImage", {
      directory: path.resolve("../apps/answer-server"),
      file: "Dockerfile",
      platform: ecrAssets.Platform.LINUX_AMD64,
    });

    // TLS cert in this region
    const cert = new acm.DnsValidatedCertificate(this, "Cert", { domainName: fqdn, hostedZone: zone, region: this.region });

    const logGroup = new logs.LogGroup(this, "Logs", { retention: logs.RetentionDays.ONE_MONTH });

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "Service", {
      cluster,
      desiredCount: 1,
      cpu: 512,
      memoryLimitMiB: 1024,
      publicLoadBalancer: true,
      redirectHTTP: true,
      certificate: cert,
      domainName: fqdn,
      domainZone: zone,
      taskImageOptions: {
        image: ecs.ContainerImage.fromDockerImageAsset(imageAsset),
        containerPort: 3000,
        enableLogging: true,
        logDriver: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: "answers" }),
        environment: {
          PORT: "3000",
          WITH_S3: "true",
          S3_REGION: props.s3Region ?? "us-east-1",
          AWS_BUCKET_NAME: props.bucketName!,
          GEMINI_API_KEY: props.geminiSecret,
          TOKEN_PUBLIC_KEY: props.jwtPublicKey,
        },
        // secrets: { GEMINI_API_KEY: ecs.Secret.fromSecretsManager(geminiSecret) },
      },
    });

    // WebSocket-friendly: keep connections alive longer
    service.loadBalancer.setAttribute("idle_timeout.timeout_seconds", "300");

    service.targetGroup.configureHealthCheck({
      path: "/health",
      healthyHttpCodes: "200-399",
      interval: Duration.seconds(30),
      timeout: Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 2,
    });

    if (props.bucketName) {
      service.taskDefinition.addToTaskRolePolicy(
        new iam.PolicyStatement({
          actions: ["s3:ListBucket"],
          resources: [`arn:aws:s3:::${props.bucketName}`],
          conditions: { StringLike: { "s3:prefix": ["answer-server-data/*"] } },
        }),
      );
      service.taskDefinition.addToTaskRolePolicy(new iam.PolicyStatement({ actions: ["s3:GetObject"], resources: [`arn:aws:s3:::${props.bucketName}/answer-server-data/*`] }));
    }

    const scaling = service.service.autoScaleTaskCount({ minCapacity: 1, maxCapacity: 4 });
    scaling.scaleOnCpuUtilization("CpuScale", { targetUtilizationPercent: 55, scaleInCooldown: Duration.minutes(2), scaleOutCooldown: Duration.minutes(1) });
  }
}
