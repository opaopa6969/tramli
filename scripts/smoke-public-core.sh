#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Usage: scripts/smoke-public-core.sh <version>" >&2
  exit 2
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

retry() {
  local attempt
  for attempt in {1..18}; do
    if "$@"; then
      return 0
    fi
    if [[ "$attempt" -eq 18 ]]; then
      return 1
    fi
    sleep 10
  done
}

echo "Smoke testing @unlaxer/tramli@$VERSION from npm"
mkdir -p "$WORK_DIR/npm"
printf '{"private":true,"type":"module"}\n' > "$WORK_DIR/npm/package.json"
retry npm install --prefix "$WORK_DIR/npm" --ignore-scripts --no-audit --no-fund "@unlaxer/tramli@$VERSION"
(
  cd "$WORK_DIR/npm"
  node --input-type=module -e "import { Tramli } from '@unlaxer/tramli'; if (!Tramli?.define) process.exit(1)"
)

echo "Smoke testing tramli@$VERSION from crates.io"
mkdir -p "$WORK_DIR/rust/src"
cat > "$WORK_DIR/rust/Cargo.toml" <<EOF
[package]
name = "tramli-public-smoke"
version = "0.0.0"
edition = "2021"

[dependencies]
tramli = "=$VERSION"
EOF
cat > "$WORK_DIR/rust/src/main.rs" <<'EOF'
use tramli::FlowContext;

fn main() {
    let _context = FlowContext::new("public-smoke".to_string());
}
EOF
retry cargo check --manifest-path "$WORK_DIR/rust/Cargo.toml" --quiet

echo "Smoke testing org.unlaxer:tramli:$VERSION from Maven Central"
mkdir -p "$WORK_DIR/java/src/main/java/smoke"
cat > "$WORK_DIR/java/pom.xml" <<EOF
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>smoke</groupId>
  <artifactId>tramli-public-smoke</artifactId>
  <version>0.0.0</version>
  <properties><maven.compiler.release>21</maven.compiler.release></properties>
  <dependencies>
    <dependency>
      <groupId>org.unlaxer</groupId>
      <artifactId>tramli</artifactId>
      <version>$VERSION</version>
    </dependency>
  </dependencies>
</project>
EOF
cat > "$WORK_DIR/java/src/main/java/smoke/Main.java" <<'EOF'
package smoke;

import org.unlaxer.tramli.Tramli;

final class Main {
    private Main() {}

    static String libraryClass() {
        return Tramli.class.getName();
    }
}
EOF
retry mvn -q -f "$WORK_DIR/java/pom.xml" compile

echo "Public core artifacts for $VERSION are consumable"
