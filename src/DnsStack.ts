import {
  Stack,
  aws_ssm as ssm,
  aws_route53 as route53,
  StackProps,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Statics } from './Statics';

export interface DnsStackProps extends StackProps {

}

export class DnsStack extends Stack {

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    // Import account hosted zone
    const accountRootZoneId = ssm.StringParameter.valueForStringParameter(this, Statics.accountRootHostedZoneId);
    const accountRootZoneName = ssm.StringParameter.valueForStringParameter(this, Statics.accountRootHostedZoneName);
    const accountRootZone = route53.HostedZone.fromHostedZoneAttributes(this, 'account-root-zone', {
      hostedZoneId: accountRootZoneId,
      zoneName: accountRootZoneName,
    });

    // Create um-demo.* hosted zone
    const zoneName = `um-demo.${accountRootZone.zoneName}`;
    const hostedZone = new route53.PublicHostedZone(this, 'webformulieren-zone', {
      zoneName,
    });

    // Register the new zone in the account root zone
    if (!hostedZone.hostedZoneNameServers) {
      throw 'No name servers found for our hosted zone, cannot create dns stack';
    }
    new route53.ZoneDelegationRecord(this, 'webformulieren-zone-delegation', {
      nameServers: hostedZone.hostedZoneNameServers,
      zone: accountRootZone,
      recordName: zoneName,
    });


    // Register the project hosted zone in parameter (eu-west-1 & us-east-1)
    new ssm.StringParameter(this, 'ssm-webformulieren-zone-id', {
      parameterName: Statics.ssmProjectHostedZoneId,
      stringValue: hostedZone.hostedZoneId,
    });
    new ssm.StringParameter(this, 'ssm-webformulieren-zone-name', {
      parameterName: Statics.ssmProjectHostedZoneName,
      stringValue: hostedZone.zoneName,
    });

    // TODO export to us-east-1 for ???
    // new util_ssmToSpecificRegion(this, 'ssm-webformulieren-zone-id-us', {
    //   paramName: statics.ssmName_webformulierenHostedZoneId,
    //   paramValue: this.hostedZone.hostedZoneId,
    //   paramRegion: props.exportParametersToRegion,
    //   resourceId: 'webformulierenhostedzoneid',
    // });
    // new util_ssmToSpecificRegion(this, 'ssm-webformulieren-zone-name-us', {
    //   paramName: statics.ssmName_webformulierenHostedZoneName,
    //   paramValue: this.hostedZone.zoneName,
    //   paramRegion: props.exportParametersToRegion,
    //   resourceId: 'webformulierenhostedzonename',
    // });

  }

}