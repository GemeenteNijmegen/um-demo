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

### Keycloak
- In de UM repo voor keycloak (https://gitlab.com/vng-realisatie/um-pilot/keycloak) wordt gebruik gemaakt van een oude keycloak container build. Deze draait niet op AWS omdat hier de ARM64 architectuur wordt gebruikt. Dot kon opgelost worden door de nieuwe versie van de image te gaan gebruiken (https://hub.docker.com/r/keycloak/keycloak). Een groot nadeel hieraan is dat de configuratie (env vars) totaal is veranderd.
- Omdat de Keycloak in de AWS omgeving achter cloudfront en loadbalancer draait is de configuratie extra lastig. Uiteindelijk bleek de volgende configuratie te werken:
  - KC_PROXY  = edge 
    - Dit zet de proxy modes voor de keycloak container. Edge betekent dat de container te benaderen is via http vanaf de loadbalancer. Dit gebeurt in het subnet van de AWS VPC en toegang tot de loadbalancer loopt via HTTPS.
  - KC_HEALTH_ENABLED = true
    - Enable healtcheck endpoints in de container
  - KC_HOSTNAME_STRICT = true
    - Zorgt er voor dat keycloak de hostname niet uit de binnenkomende requests haalt maar uit de configuratie
  - KC_HOSTNAME_STRICT_BACKCHANNEL = true
    - Zorgt er voor dat keycloak voor de andere endpoints (backchannel endpoints) dezelfde hostname gebruikt uit de configuratie als de frontend. 
  - KC_HTTP_RELATIVE_PATH =  /auth
    - Zorgt dat de keycloak instalatie in de container onder het path /auth te berijken is. (default is de root, maar omdat we keycloak aan de loadbalancer en in cloudfront op het path /auth exposen wordt dit in de container ook gedaan)
  - KC_HOSTNAME_URL = https://um-demo.csp-nijmegen.nl/auth
    - Zet de url waarop keycloak beschikbaar is zodat de frontend dit kan gebruiken
  - KC_HOSTNAME_ADMIN_URL = https://um-demo.csp-nijmegen.nl/auth
    - Zet de url waarop de keycloak admin console beschikbaar is (nodig voor de frontend)
- Om keycloak achter cloudfront en een loadbalancer te kunnen draaien is de configuratie van cloudfront en de loadbalacner belangrijk. Deze moete de juiste X-Forwarded-* headers mee sturen. Dit gebeurt vanzelf bij de loadbalancer. Voor CloudFront is het expliciet nodig de caching op disabled te zetten en de origin request policy op `AllViewer` te zetten (zodat alle headers en query strings worden doorgegeven en niet gecached).
- TODO De realm dient nog geconfigureerd te worden.

### Elasticsearch 
- Container size (memory intensive)
- Container architecture fix
- Container nr of open files (ulimit)
- Container disable virtual memeory areas (mmap)


### Applicatie containers
- Waarom is elasticsearch nodig 
- Waarom moet er een portnummer in elasticsearch

## Nuttig
- [Uitwisselings Mechanisme (UM) gitlab](https://gitlab.com/vng-realisatie/um-pilot)
- [Er is een tag gemaakt](https://github.com/GemeenteNijmegen/um-demo/releases/tag/hello-world-container) met een hallo-world demo in de begin fase van dit project. De code in de staat bij de tag bied een simpel voorbeeld van het draaien van een container op een ECS cluster en exposen van de service via een loadbalancer.
- [Er is nog een tag aangemaakt](https://github.com/GemeenteNijmegen/um-demo/releases/tag/hello-world-cloudfront) waarin een nginx hello-world container draait in combinatie met een cloudfront distributie. 