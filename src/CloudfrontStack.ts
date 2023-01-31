import {
  Stack,
  StackProps,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_ssm as ssm,
  aws_certificatemanager as acm,
  aws_route53 as route53,
  aws_route53_targets as targets,
} from 'aws-cdk-lib';
import { RemoteParameters } from 'cdk-remote-stack';
import { Construct } from 'constructs';
import { Statics } from './Statics';


export class CloudfrontStack extends Stack {

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Domain name
    const hostedZoneId = ssm.StringParameter.valueForStringParameter(this, Statics.accountRootHostedZoneId);
    const hostedZoneName = ssm.StringParameter.valueForStringParameter(this, Statics.accountRootHostedZoneName);
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'hostedzone', {
      hostedZoneId: hostedZoneId,
      zoneName: hostedZoneName,
    });
    const albDomainName = `alb.${hostedZoneName}`;

    // Create the distribution
    const dist = new cloudfront.Distribution(this, 'distribution', {
      comment: 'UM-demo cloudfront distribution',
      defaultBehavior: {
        origin: new origins.HttpOrigin(albDomainName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.MATCH_VIEWER,
          customHeaders: {
            'X-Cloudfront-Access-Token': Statics.cloudfrontAlbAccessToken,
          },
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        //cachePolicy: props.cloudfrontCachePolicy,
      },
      domainNames: [
        hostedZoneName,
      ],
      certificate: this.getCertificate(),
    });

    this.createDnsRecords(dist, hostedZone);

    // Export the distribution for importing in other stacks
    new ssm.StringParameter(this, 'ssm-distribution-arn', {
      parameterName: Statics.ssmCloudfrontDistributionId,
      stringValue: dist.distributionId,
    });

  }

  private createDnsRecords(distribution: cloudfront.Distribution, hostedZone: route53.IHostedZone) {

    new route53.ARecord(this, 'dist-record-a', {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    new route53.AaaaRecord(this, 'dist-record-aaaa', {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

  }

  private getCertificate() {
    const params = new RemoteParameters(this, 'params', {
      path: Statics.ssmParamsPath,
      region: 'us-east-1',
    });
    const certArn = params.get(Statics.ssmCertificateArn);
    const cert = acm.Certificate.fromCertificateArn(this, 'cert', certArn);
    return cert;
  }

}