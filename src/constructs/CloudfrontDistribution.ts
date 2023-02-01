import {
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_ssm as ssm,
  aws_certificatemanager as acm,
  aws_route53 as route53,
  aws_route53_targets as targets,
} from 'aws-cdk-lib';
import { RemoteParameters } from 'cdk-remote-stack';
import { Construct } from 'constructs';
import { Statics } from '../Statics';


export class CloudfrontDistribution extends Construct {

  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Domain name
    const hostedZoneId = ssm.StringParameter.valueForStringParameter(this, Statics.accountRootHostedZoneId);
    const hostedZoneName = ssm.StringParameter.valueForStringParameter(this, Statics.accountRootHostedZoneName);
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'hostedzone', {
      hostedZoneId: hostedZoneId,
      zoneName: hostedZoneName,
    });
    const albDomainName = `alb.${hostedZoneName}`;

    // Create the distribution
    this.distribution = new cloudfront.Distribution(this, 'distribution', {
      comment: 'UM-demo cloudfront distribution',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: new origins.HttpOrigin(albDomainName, {
          originPath: '/webapp',
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

    this.createDnsRecords(hostedZone);

    // Export the distribution for importing in other stacks
    new ssm.StringParameter(this, 'ssm-distribution-arn', {
      parameterName: Statics.ssmCloudfrontDistributionId,
      stringValue: this.distribution.distributionId,
    });
    new ssm.StringParameter(this, 'ssm-distribution-domainname', {
      parameterName: Statics.ssmCloudfrontDistributionDomain,
      stringValue: this.distribution.domainName,
    });

  }

  private createDnsRecords(hostedZone: route53.IHostedZone) {

    new route53.ARecord(this, 'dist-record-a', {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
    });

    new route53.AaaaRecord(this, 'dist-record-aaaa', {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
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