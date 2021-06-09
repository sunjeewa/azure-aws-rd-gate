CDK=cdk --profile ${AWS_PROFILE}
all:
	npm run build

install:
	$(CDK) deploy

diff:
	$(CDK) diff
