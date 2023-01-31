import {
  Stack,
  StackProps,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_ssm as ssm,
  aws_certificatemanager as acm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Statics } from './Statics';


export class CloudfrontStack extends Stack {

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Import cert
    const certArn = ssm.StringParameter.valueForStringParameter(this, Statics.ssmCertificateArn);
    const cert = acm.Certificate.fromCertificateArn(this, 'cert', certArn);

    // Domain name
    const hostedZoneName = ssm.StringParameter.valueForStringParameter(this, Statics.accountRootHostedZoneName);
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
      certificate: cert,
    });

    // Export the distribution for importing in other stacks
    new ssm.StringParameter(this, 'ssm-distribution-arn', {
      parameterName: Statics.ssmCloudfrontDistributionId,
      stringValue: dist.distributionId,
    });

  }

}