# Uitwisselings Mechanisme (UM) demo

Doel van dit project is het uitrollen en draaien van [UM](https://gitlab.com/vng-realisatie/um-pilot) in de AWS omgeving van Gemeente Nijmegen.
Dit project bevat de infrastructuur as code (IaC) om de containers uit te rollen in een AWS ECS cluster met fargate.


## Opzet AWS infrastructuur

![architectuur](./docs/architectuur.drawio.svg)

De opzet hierboven maakt gebruikt van ECS met fargate services. 
- Elke service bestaat uit een aantal taken, deze taken zijn containers en worden gemanaged door AWS. 
- De loadbalancer weet elke containers waar draaien en zal verkeer naar de containers sturen. 
- Het is mogelijk meerdere services te koppelen aan dezelfde loadbalancer. 
- Het is dus ook mogelijk om meerdere taken onder een service te hebben. 

### Cloudfront en loadbalancer
Omdat de AWS loadbalancer naar het internet open moet staan is het nodig deze te beveiligen.
Zo kan het verkeer alleen via cloudfront naar de loadbalancer en niet direct.
[Zie de AWS documentatie hierover](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/restrict-access-to-load-balancer.html)
**Let op:** De header en waarde zijn niet geheim in deze repository, de waarde dient geheim gehouden te worden.

### Container to container communication
Omdat de containers (tasks) zijn ondergebracht in apparte services met misschien meerdere tasks wordt container-container communicatie wat complexer.
Er zijn [drie opties om dit voor elkaar te krijgen](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/networking-connecting-services.html)
- Service discovery
- Internal (inside vpc only) loadbalancer
- Service mesh

TODO uitzoeken welke te gebruiken

### Config file mounting
De UM containers maken veel gebruik van configuratie files die aan de container gemount worden. In AWS is dit lastiger omdat we de images niet zelf in beheer (willen) hebben.
Dit probleem geld voor veel containers omdat het gebruik van configuratie files erg is gestandaardiseerd.

Voor zover we hebben gevonden zijn er twee opties:
- Optie 1: ECS de image laten builden, geen idee of die dan in een ecr repo terechtkomt. ecs.ContainerImage.fromAsset(‘./image’). Zorgt er voor dat er een nieuwe container wordt gebouwd en gedeployed.
  - De container staat niet in ECR
  - Bij lokaal gebruik is de CDK slim genoeg om de container niet elke keer opnieuw te bouwen bij elke deployment, alleen als er wijzigingen zijn.
- Optie 2: [een ecr-asset maken](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecr_assets-readme.html), image wordt dan ‘onderwater’ in een ecr repo opgeslagen, heb je verder geen bemoeienis mee. Imagetag krijg je als property, en die kun je dan meegeven aan een taskdefinition.

Enkel optie 1 is tot nu toe in gebruik voor dit project. 

## Nuttig
- [Uitwisselings Mechanisme (UM) gitlab](https://gitlab.com/vng-realisatie/um-pilot)
- [Er is een tag gemaakt](https://github.com/GemeenteNijmegen/um-demo/releases/tag/hello-world-container) met een hallo-world demo in de begin fase van dit project. De code in de staat bij de tag bied een simpel voorbeeld van het draaien van een container op een ECS cluster en exposen van de service via een loadbalancer.
- [Er is nog een tag aangemaakt](https://github.com/GemeenteNijmegen/um-demo/releases/tag/hello-world-cloudfront) waarin een nginx hello-world container draait in combinatie met een cloudfront distributie. 