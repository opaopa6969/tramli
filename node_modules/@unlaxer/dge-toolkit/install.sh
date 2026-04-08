#!/usr/bin/env bash
set -euo pipefail

# DGE toolkit installer
# Copies dge/ and .claude/skills/ to the current project directory.

# Parse --lang option (default: ja)
LANG_OPT="ja"
TARGET_DIR="."
for arg in "$@"; do
  case "${arg}" in
    --lang=*) LANG_OPT="${arg#*=}"; LANG_EXPLICITLY_SET=true ;;
    --lang)   ;; # next arg handled below
    *)
      if [ "${prev_arg:-}" = "--lang" ]; then
        LANG_OPT="${arg}"; LANG_EXPLICITLY_SET=true
      else
        TARGET_DIR="${arg}"
      fi
      ;;
  esac
  prev_arg="${arg}"
done

# Auto-detect locale if --lang not explicitly provided
if [ "${LANG_OPT}" = "ja" ] && [ "${LANG_EXPLICITLY_SET:-false}" = "false" ]; then
  case "${LANG:-}" in
    en*|EN*) LANG_OPT="en" ;;
    C|POSIX) LANG_OPT="en" ;;
  esac
fi

# Validate lang
if [ "${LANG_OPT}" != "ja" ] && [ "${LANG_OPT}" != "en" ]; then
  echo "Error: --lang must be 'ja' or 'en' (got '${LANG_OPT}')"
  exit 1
fi

# Resolve symlinks (npx creates symlink in node_modules/.bin/)
REAL_PATH="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
SCRIPT_DIR="$(cd "$(dirname "${REAL_PATH}")" && pwd)"

echo "DGE toolkit — installing to ${TARGET_DIR} (lang=${LANG_OPT})"
echo ""

# Resolve source: npm (node_modules) or local
if [ -f "${SCRIPT_DIR}/method.md" ]; then
  SRC="${SCRIPT_DIR}"
elif [ -f "${SCRIPT_DIR}/../method.md" ]; then
  SRC="${SCRIPT_DIR}/.."
else
  echo "Error: Cannot find DGE toolkit files. Run from the kit/ directory or via npx."
  exit 1
fi

# Copy dge/ folder
DGE_DIR="${TARGET_DIR}/dge"
if [ -d "${DGE_DIR}" ]; then
  echo "  dge/ already exists — skipping (won't overwrite your files)"
else
  mkdir -p "${DGE_DIR}/characters" "${DGE_DIR}/templates" "${DGE_DIR}/sessions" "${DGE_DIR}/custom/characters" "${DGE_DIR}/projects" "${DGE_DIR}/specs"

  if [ "${LANG_OPT}" = "en" ]; then
    # English install
    cp "${SRC}/README.en.md" "${DGE_DIR}/README.md"
    cp "${SRC}/LICENSE" "${DGE_DIR}/"
    cp "${SRC}/method.en.md" "${DGE_DIR}/method.md"
    cp "${SRC}/characters/index.en.md" "${DGE_DIR}/characters/index.md"
    # Use index.en.md as the canonical index for en installs
    cp "${SRC}/characters/index.en.md" "${DGE_DIR}/characters/index.en.md"
    cp "${SRC}/characters/en/"*.md "${DGE_DIR}/characters/"
    cp "${SRC}/templates/en/"*.md "${DGE_DIR}/templates/"
    [ -f "${SRC}/integration-guide.en.md" ] && cp "${SRC}/integration-guide.en.md" "${DGE_DIR}/integration-guide.md"
    [ -f "${SRC}/patterns.en.md" ] && cp "${SRC}/patterns.en.md" "${DGE_DIR}/patterns.md"
    [ -f "${SRC}/INTERNALS.en.md" ] && cp "${SRC}/INTERNALS.en.md" "${DGE_DIR}/INTERNALS.md"
    [ -f "${SRC}/CUSTOMIZING.en.md" ] && cp "${SRC}/CUSTOMIZING.en.md" "${DGE_DIR}/CUSTOMIZING.md"
    [ -f "${SRC}/dialogue-techniques.md" ] && cp "${SRC}/dialogue-techniques.md" "${DGE_DIR}/"
  else
    # Japanese install (default)
    cp "${SRC}/README.md" "${DGE_DIR}/"
    cp "${SRC}/LICENSE" "${DGE_DIR}/"
    cp "${SRC}/method.md" "${DGE_DIR}/"
    cp "${SRC}/characters/"*.md "${DGE_DIR}/characters/"
    cp "${SRC}/templates/"*.md "${DGE_DIR}/templates/"
    [ -f "${SRC}/integration-guide.md" ] && cp "${SRC}/integration-guide.md" "${DGE_DIR}/"
    [ -f "${SRC}/patterns.md" ] && cp "${SRC}/patterns.md" "${DGE_DIR}/"
    [ -f "${SRC}/INTERNALS.md" ] && cp "${SRC}/INTERNALS.md" "${DGE_DIR}/"
    [ -f "${SRC}/CUSTOMIZING.md" ] && cp "${SRC}/CUSTOMIZING.md" "${DGE_DIR}/"
    [ -f "${SRC}/dialogue-techniques.md" ] && cp "${SRC}/dialogue-techniques.md" "${DGE_DIR}/"
  fi

  # Copy sample design document
  mkdir -p "${DGE_DIR}/samples"
  if [ "${LANG_OPT}" = "en" ]; then
    [ -f "${SRC}/samples/auth-api.en.md" ] && cp "${SRC}/samples/auth-api.en.md" "${DGE_DIR}/samples/auth-api.md"
  else
    [ -f "${SRC}/samples/auth-api.md" ] && cp "${SRC}/samples/auth-api.md" "${DGE_DIR}/samples/auth-api.md"
  fi
  echo "  dge/samples/ created"

  if [ -d "${SRC}/flows" ]; then
    mkdir -p "${DGE_DIR}/flows"
    cp "${SRC}/flows/"*.yaml "${DGE_DIR}/flows/" 2>/dev/null || true
  fi
  if [ -d "${SRC}/bin" ]; then
    mkdir -p "${DGE_DIR}/bin"
    cp "${SRC}/bin/"* "${DGE_DIR}/bin/" 2>/dev/null || true
    chmod +x "${DGE_DIR}/bin/"* 2>/dev/null || true
    echo "  dge/bin/ created"
  fi
  # Version tracking for updates
  SRC_VERSION="$(cat "${SRC}/version.txt" 2>/dev/null || echo "1.0.0")"
  echo "${SRC_VERSION}" > "${DGE_DIR}/version.txt"
  # Save lang preference for future updates
  echo "${LANG_OPT}" > "${DGE_DIR}/.lang"
  echo "  dge/ created (v${SRC_VERSION}, lang=${LANG_OPT})"
fi

# Copy skill to .claude/skills/
SKILLS_DIR="${TARGET_DIR}/.claude/skills"
mkdir -p "${SKILLS_DIR}"

if [ "${LANG_OPT}" = "en" ]; then
  SKILL_SRC="${SRC}/skills/en"
else
  SKILL_SRC="${SRC}/skills"
fi

for SKILL in dge-session.md dge-update.md dge-character-create.md; do
  if [ -f "${SKILL_SRC}/${SKILL}" ]; then
    if [ -f "${SKILLS_DIR}/${SKILL}" ]; then
      echo "  .claude/skills/${SKILL} already exists — skipping"
    else
      cp "${SKILL_SRC}/${SKILL}" "${SKILLS_DIR}/${SKILL}"
      echo "  .claude/skills/${SKILL} created"
    fi
  fi
done

# Multi-tool support: AGENTS.md (Codex), GEMINI.md (Gemini CLI), .cursorrules (Cursor)
DGE_SECTION_FILE="${SRC}/agents-dge-section.md"
if [ "${LANG_OPT}" = "en" ]; then
  DGE_SECTION_FILE="${SRC}/agents-dge-section.en.md"
fi

for CONFIG_FILE in AGENTS.md GEMINI.md .cursorrules; do
  TARGET_CONFIG="${TARGET_DIR}/${CONFIG_FILE}"
  if [ -f "${TARGET_CONFIG}" ]; then
    if grep -q "DGE — Dialogue-driven Gap Extraction" "${TARGET_CONFIG}" 2>/dev/null; then
      echo "  ${CONFIG_FILE} already contains DGE section — skipping"
    else
      echo "" >> "${TARGET_CONFIG}"
      cat "${DGE_SECTION_FILE}" >> "${TARGET_CONFIG}"
      echo "  ${CONFIG_FILE} — DGE section appended"
    fi
  else
    cat "${DGE_SECTION_FILE}" > "${TARGET_CONFIG}"
    echo "  ${CONFIG_FILE} created"
  fi
done

echo ""
echo "Done! DGE toolkit is ready."
echo ""
if [ "${LANG_OPT}" = "en" ]; then
  echo '  In Claude Code, say "run DGE" to start.'
  echo '  Also works with Codex (AGENTS.md), Gemini CLI (GEMINI.md), and Cursor (.cursorrules).'
  echo '  Try: "run DGE on dge/samples/auth-api.md"'
else
  echo '  Claude Code で「DGE して」と言えば起動します。'
  echo '  Codex (AGENTS.md), Gemini CLI (GEMINI.md), Cursor (.cursorrules) にも対応。'
  echo '  Try: "dge/samples/auth-api.md を DGE して"'
fi
echo ""
echo "MIT License. See dge/LICENSE for details."
