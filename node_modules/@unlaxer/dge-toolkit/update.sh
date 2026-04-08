#!/usr/bin/env bash
set -euo pipefail

# DGE toolkit updater
# Updates toolkit-managed files in dge/. Never touches sessions/ or custom/.

REAL_PATH="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
SCRIPT_DIR="$(cd "$(dirname "${REAL_PATH}")" && pwd)"
TARGET_DIR="${1:-.}"

# Resolve source
if [ -f "${SCRIPT_DIR}/method.md" ]; then
  SRC="${SCRIPT_DIR}"
elif [ -f "${SCRIPT_DIR}/../method.md" ]; then
  SRC="${SCRIPT_DIR}/.."
else
  echo "Error: Cannot find DGE toolkit files."
  exit 1
fi

DGE_DIR="${TARGET_DIR}/dge"
SKILLS_DIR="${TARGET_DIR}/.claude/skills"

if [ ! -d "${DGE_DIR}" ]; then
  echo "Error: dge/ not found. Run 'npx dge-install' first."
  exit 1
fi

# Detect lang from .lang file (saved during install)
LANG_OPT="ja"
if [ -f "${DGE_DIR}/.lang" ]; then
  LANG_OPT="$(cat "${DGE_DIR}/.lang")"
fi

# Get versions
SRC_VERSION="$(cat "${SRC}/version.txt" 2>/dev/null || echo "unknown")"
LOCAL_VERSION="$(cat "${DGE_DIR}/version.txt" 2>/dev/null || echo "unknown")"

echo "DGE toolkit — update (lang=${LANG_OPT})"
echo ""
echo "  Local:  ${LOCAL_VERSION}"
echo "  Source: ${SRC_VERSION}"
echo ""

if [ "${SRC_VERSION}" = "${LOCAL_VERSION}" ]; then
  echo "Already up to date."
  exit 0
fi

# Set lang-specific file mappings
if [ "${LANG_OPT}" = "en" ]; then
  METHOD_SRC="${SRC}/method.en.md"
  README_SRC="${SRC}/README.en.md"
  CHAR_SRC="${SRC}/characters/en"
  CHAR_INDEX_SRC="${SRC}/characters/index.en.md"
  TMPL_SRC="${SRC}/templates/en"
  SKILL_SRC="${SRC}/skills/en"
  INTEGRATION_SRC="${SRC}/integration-guide.en.md"
  PATTERNS_SRC="${SRC}/patterns.en.md"
  INTERNALS_SRC="${SRC}/INTERNALS.en.md"
  CUSTOMIZING_SRC="${SRC}/CUSTOMIZING.en.md"
else
  METHOD_SRC="${SRC}/method.md"
  README_SRC="${SRC}/README.md"
  CHAR_SRC="${SRC}/characters"
  CHAR_INDEX_SRC=""
  TMPL_SRC="${SRC}/templates"
  SKILL_SRC="${SRC}/skills"
  INTEGRATION_SRC="${SRC}/integration-guide.md"
  PATTERNS_SRC="${SRC}/patterns.md"
  INTERNALS_SRC="${SRC}/INTERNALS.md"
  CUSTOMIZING_SRC="${SRC}/CUSTOMIZING.md"
fi

# Show what will be updated
echo "The following toolkit files will be updated:"
echo ""

UPDATED=0

# Check core files
for pair in "${README_SRC}:README.md" "${METHOD_SRC}:method.md" "${SRC}/LICENSE:LICENSE" "${SRC}/version.txt:version.txt"; do
  src_file="${pair%%:*}"
  dst_name="${pair##*:}"
  if [ -f "${src_file}" ]; then
    if [ -f "${DGE_DIR}/${dst_name}" ]; then
      if ! diff -q "${src_file}" "${DGE_DIR}/${dst_name}" > /dev/null 2>&1; then
        echo "  [changed] dge/${dst_name}"
        UPDATED=$((UPDATED + 1))
      fi
    else
      echo "  [new]     dge/${dst_name}"
      UPDATED=$((UPDATED + 1))
    fi
  fi
done

# Check characters
if [ "${LANG_OPT}" = "en" ]; then
  # Check index.en.md → index.md
  if [ -f "${CHAR_INDEX_SRC}" ]; then
    if ! diff -q "${CHAR_INDEX_SRC}" "${DGE_DIR}/characters/index.md" > /dev/null 2>&1; then
      echo "  [changed] dge/characters/index.md"
      UPDATED=$((UPDATED + 1))
    fi
  fi
fi
for f in "${CHAR_SRC}/"*.md; do
  [ -f "${f}" ] || continue
  fname="$(basename "${f}")"
  if [ -f "${DGE_DIR}/characters/${fname}" ]; then
    if ! diff -q "${f}" "${DGE_DIR}/characters/${fname}" > /dev/null 2>&1; then
      echo "  [changed] dge/characters/${fname}"
      UPDATED=$((UPDATED + 1))
    fi
  else
    echo "  [new]     dge/characters/${fname}"
    UPDATED=$((UPDATED + 1))
  fi
done

# Check templates
for f in "${TMPL_SRC}/"*.md; do
  [ -f "${f}" ] || continue
  fname="$(basename "${f}")"
  if [ -f "${DGE_DIR}/templates/${fname}" ]; then
    if ! diff -q "${f}" "${DGE_DIR}/templates/${fname}" > /dev/null 2>&1; then
      echo "  [changed] dge/templates/${fname}"
      UPDATED=$((UPDATED + 1))
    fi
  else
    echo "  [new]     dge/templates/${fname}"
    UPDATED=$((UPDATED + 1))
  fi
done

# Check skills
for SKILL in dge-session.md dge-update.md dge-character-create.md; do
  if [ -f "${SKILL_SRC}/${SKILL}" ]; then
    if [ ! -f "${SKILLS_DIR}/${SKILL}" ]; then
      echo "  [new]     .claude/skills/${SKILL}"
      UPDATED=$((UPDATED + 1))
    elif ! diff -q "${SKILL_SRC}/${SKILL}" "${SKILLS_DIR}/${SKILL}" > /dev/null 2>&1; then
      echo "  [changed] .claude/skills/${SKILL}"
      UPDATED=$((UPDATED + 1))
    fi
  fi
done

echo ""
echo "  Will NOT touch: dge/sessions/, dge/custom/, dge/projects/, dge/specs/"
echo ""

if [ "${UPDATED}" -eq 0 ]; then
  echo "No file changes detected (version mismatch only). Updating version.txt."
  echo "${SRC_VERSION}" > "${DGE_DIR}/version.txt"
  exit 0
fi

read -p "Update ${UPDATED} file(s)? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

# Perform update — toolkit managed files only
mkdir -p "${DGE_DIR}/characters" "${DGE_DIR}/templates"

[ -f "${README_SRC}" ] && cp "${README_SRC}" "${DGE_DIR}/README.md"
[ -f "${SRC}/LICENSE" ] && cp "${SRC}/LICENSE" "${DGE_DIR}/LICENSE"
[ -f "${METHOD_SRC}" ] && cp "${METHOD_SRC}" "${DGE_DIR}/method.md"

if [ "${LANG_OPT}" = "en" ]; then
  [ -f "${CHAR_INDEX_SRC}" ] && cp "${CHAR_INDEX_SRC}" "${DGE_DIR}/characters/index.md"
  [ -f "${CHAR_INDEX_SRC}" ] && cp "${CHAR_INDEX_SRC}" "${DGE_DIR}/characters/index.en.md"
fi
cp "${CHAR_SRC}/"*.md "${DGE_DIR}/characters/"
cp "${TMPL_SRC}/"*.md "${DGE_DIR}/templates/"
echo "${SRC_VERSION}" > "${DGE_DIR}/version.txt"

# Update additional docs
[ -f "${INTERNALS_SRC}" ] && cp "${INTERNALS_SRC}" "${DGE_DIR}/INTERNALS.md"
[ -f "${CUSTOMIZING_SRC}" ] && cp "${CUSTOMIZING_SRC}" "${DGE_DIR}/CUSTOMIZING.md"
[ -f "${SRC}/dialogue-techniques.md" ] && cp "${SRC}/dialogue-techniques.md" "${DGE_DIR}/"
[ -f "${PATTERNS_SRC}" ] && cp "${PATTERNS_SRC}" "${DGE_DIR}/patterns.md"
[ -f "${INTEGRATION_SRC}" ] && cp "${INTEGRATION_SRC}" "${DGE_DIR}/integration-guide.md"

if [ -d "${SRC}/flows" ]; then
  mkdir -p "${DGE_DIR}/flows"
  cp "${SRC}/flows/"*.yaml "${DGE_DIR}/flows/" 2>/dev/null || true
fi
if [ -d "${SRC}/bin" ]; then
  mkdir -p "${DGE_DIR}/bin"
  cp "${SRC}/bin/"* "${DGE_DIR}/bin/" 2>/dev/null || true
  chmod +x "${DGE_DIR}/bin/"* 2>/dev/null || true
fi

# Update skills
mkdir -p "${SKILLS_DIR}"
for SKILL in dge-session.md dge-update.md dge-character-create.md; do
  [ -f "${SKILL_SRC}/${SKILL}" ] && cp "${SKILL_SRC}/${SKILL}" "${SKILLS_DIR}/${SKILL}"
done

# Multi-tool support: update DGE section in AGENTS.md, GEMINI.md, .cursorrules
DGE_SECTION_FILE="${SRC}/agents-dge-section.md"
if [ "${LANG_OPT}" = "en" ]; then
  DGE_SECTION_FILE="${SRC}/agents-dge-section.en.md"
fi

for CONFIG_FILE in AGENTS.md GEMINI.md .cursorrules; do
  TARGET_CONFIG="${TARGET_DIR}/${CONFIG_FILE}"
  if [ -f "${TARGET_CONFIG}" ]; then
    if grep -q "DGE — Dialogue-driven Gap Extraction" "${TARGET_CONFIG}" 2>/dev/null; then
      # Remove old DGE section (from heading to next ## heading or EOF)
      awk '
        /^## DGE — Dialogue-driven Gap Extraction/ { skip=1; next }
        skip && /^## / { skip=0 }
        !skip { print }
      ' "${TARGET_CONFIG}" > "${TARGET_CONFIG}.tmp"
      mv "${TARGET_CONFIG}.tmp" "${TARGET_CONFIG}"
      echo "" >> "${TARGET_CONFIG}"
      cat "${DGE_SECTION_FILE}" >> "${TARGET_CONFIG}"
      echo "  ${CONFIG_FILE} — DGE section updated"
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
echo "Updated to v${SRC_VERSION}."
echo "  dge/sessions/, dge/custom/, dge/projects/, dge/specs/ were not touched."
