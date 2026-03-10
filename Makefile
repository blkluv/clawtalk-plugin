# ClawTalk Plugin - Release Makefile
#
# Commands:
#   make release-local    Build tgz + checksum locally
#   make bump-patch       Bump patch version (0.1.0 → 0.1.1)
#   make bump-minor       Bump minor version (0.1.0 → 0.2.0)
#   make bump-major       Bump major version (0.1.0 → 1.0.0)
#   make clean            Remove built artifacts
#   make version          Print current version
#   make check            Run typecheck + lint + tests
#   make build            Build the plugin
#
# Release workflow:
#   1. make bump-patch                    (or bump-minor / bump-major)
#   2. git checkout -b chore/bump-vX.Y.Z
#   3. git add package.json && git commit -m "chore: bump to vX.Y.Z"
#   4. git push -u origin chore/bump-vX.Y.Z
#   5. Merge PR to main
#   6. git checkout main && git pull
#   7. git tag vX.Y.Z && git push --tags
#   8. GitHub Actions builds tgz + checksum and creates the release automatically
#
# Manual release (if Actions unavailable):
#   1. make release-local
#   2. Follow the printed gh command to publish

VERSION := $(shell jq -r .version package.json)
NAME := $(shell jq -r .name package.json)
TGZ := $(NAME)-$(VERSION).tgz
CHECKSUM := $(TGZ).sha256

.PHONY: version check build release-tgz release-checksum release-local clean bump-patch bump-minor bump-major

version:
	@echo $(VERSION)

check:
	@echo "Typechecking..."
	@npx tsc --noEmit
	@echo "Linting..."
	@npx biome check .
	@echo "Testing..."
	@npx vitest run
	@echo "✓ All checks passed"

build:
	@echo "Building..."
	@npm run build
	@echo "✓ Built"

release-tgz: build
	@echo "Packing $(TGZ)..."
	@rm -f $(NAME)-*.tgz
	@npm pack --quiet
	@echo "✓ Packed $(TGZ)"

release-checksum: release-tgz
	@echo "Generating $(CHECKSUM)..."
	@shasum -a 256 $(TGZ) > $(CHECKSUM)
	@cat $(CHECKSUM)
	@echo "✓ Generated $(CHECKSUM)"

release-local: check release-checksum
	@echo ""
	@echo "Release artifacts ready:"
	@echo "  $(TGZ)"
	@echo "  $(CHECKSUM)"
	@echo ""
	@echo "To publish manually:"
	@echo "  gh release create v$(VERSION) $(TGZ) $(CHECKSUM) --repo team-telnyx/clawtalk-plugin --title v$(VERSION) --generate-notes"

clean:
	@rm -f $(NAME)-*.tgz $(NAME)-*.tgz.sha256
	@echo "✓ Cleaned release artifacts"

bump-patch:
	@CURRENT=$(VERSION); \
	MAJOR=$$(echo $$CURRENT | cut -d. -f1); \
	MINOR=$$(echo $$CURRENT | cut -d. -f2); \
	PATCH=$$(echo $$CURRENT | cut -d. -f3); \
	NEW="$$MAJOR.$$MINOR.$$((PATCH + 1))"; \
	jq --arg v "$$NEW" '.version = $$v' package.json > package.json.tmp && mv package.json.tmp package.json; \
	echo "✓ Bumped $$CURRENT → $$NEW"

bump-minor:
	@CURRENT=$(VERSION); \
	MAJOR=$$(echo $$CURRENT | cut -d. -f1); \
	MINOR=$$(echo $$CURRENT | cut -d. -f2); \
	NEW="$$MAJOR.$$((MINOR + 1)).0"; \
	jq --arg v "$$NEW" '.version = $$v' package.json > package.json.tmp && mv package.json.tmp package.json; \
	echo "✓ Bumped $$CURRENT → $$NEW"

bump-major:
	@CURRENT=$(VERSION); \
	MAJOR=$$(echo $$CURRENT | cut -d. -f1); \
	NEW="$$((MAJOR + 1)).0.0"; \
	jq --arg v "$$NEW" '.version = $$v' package.json > package.json.tmp && mv package.json.tmp package.json; \
	echo "✓ Bumped $$CURRENT → $$NEW"
