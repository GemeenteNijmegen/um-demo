export class Statics {

  static readonly accountRootHostedZoneId: string = '/gemeente-nijmegen/account/hostedzone/id';
  static readonly accountRootHostedZoneName: string = '/gemeente-nijmegen/account/hostedzone/name';
  static readonly ssmProjectHostedZoneId: string = '/cdk/um-demo/hostedZone/id';
  static readonly ssmProjectHostedZoneName: string = '/cdk/um-demo/hostedZone/name';


  static readonly secretDockerHub: string = '/cdk/um-demo/secret/dockerhub';

  static readonly umDemoEnvironment = {
    account: '698929623502',
    region: 'eu-west-1',
  };

}