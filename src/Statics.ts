export class Statics {

  static readonly accountRootHostedZonePath: string = '/gemeente-nijmegen/account/hostedzone/';
  static readonly accountRootHostedZoneId: string = '/gemeente-nijmegen/account/hostedzone/id';
  static readonly accountRootHostedZoneName: string = '/gemeente-nijmegen/account/hostedzone/name';


  static readonly ssmParamsPath: string = '/cdk/um-demo/ssm/';
  static readonly ssmCertificateArn: string = '/cdk/um-demo/ssm/certificate-arn';
  static readonly ssmCloudfrontDistributionId: string = '/cdk/um-demo/ssm/cloudfront/dist-id';
  static readonly ssmCloudfrontDistributionDomain: string = '/cdk/um-demo/ssm/cloudfront/dist-domainname';


  static readonly secretDockerHub: string = '/cdk/um-demo/secret/dockerhub';

  static readonly umDemoEnvironment = {
    account: '698929623502',
    region: 'eu-west-1',
  };

  static readonly cloudfrontAlbAccessToken = '40ee4109-ac3f-452f-9bab-bf7ff6ed221a';

}