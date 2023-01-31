import {
  Stack,
  StackProps,
  aws_certificatemanager as acm,
  aws_route53 as route53,
  aws_ssm as ssm,
} from 'aws-cdk-lib';
import { RemoteParameters } from 'cdk-remote-stack';
import { Construct } from 'constructs';
import { Statics } from './Statics';


export class CertStack extends Stack {

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const params = new RemoteParameters(this, 'hostedzone-params', {
      path: Statics.accountRootHostedZonePath,
      region: 'eu-west-1',
      alwaysUpdate: false,
    });

    const hostedZoneId = params.get(Statics.accountRootHostedZoneId);
    const hostedZoneName = params.get(Statics.accountRootHostedZoneName);
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'hostedzone', {
      hostedZoneId: hostedZoneId,
      zoneName: hostedZoneName,
    });

    const cert = new acm.Certificate(this, 'cert', {
      domainName: hostedZoneName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    new ssm.StringParameter(this, 'cert-arn-ssm', {
      parameterName: Statics.ssmCertificateArn,
      stringValue: cert.certificateArn,
    });

  }

}