#!/usr/bin/env bash
#
# create-worktree.sh - Create a git worktree with .env files, .claude config, and dependencies
#
# Usage:
#   ./scripts/create-worktree.sh <branch-name> [worktree-path]
#
# Examples:
#   ./scripts/create-worktree.sh feature/new-feature
#   ./scripts/create-worktree.sh bugfix/fix-123 ../frontend-bugfix
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the root of the current git repository
REPO_ROOT="$(git rev-parse --show-toplevel)"
REPO_NAME="$(basename "$REPO_ROOT")"

# Parse arguments
BRANCH_NAME="$1"
WORKTREE_PATH="$2"

if [ -z "$BRANCH_NAME" ]; then
    echo -e "${RED}Error: Branch name is required${NC}"
    echo ""
    echo "Usage: $0 <branch-name> [worktree-path]"
    echo ""
    echo "Examples:"
    echo "  $0 feature/new-feature"
    echo "  $0 bugfix/fix-123 ../frontend-bugfix"
    exit 1
fi

# Default worktree path: sibling directory with branch name (sanitized)
if [ -z "$WORKTREE_PATH" ]; then
    # Sanitize branch name for directory (replace / with -)
    SANITIZED_BRANCH="${BRANCH_NAME//\//-}"
    WORKTREE_PATH="$(dirname "$REPO_ROOT")/${REPO_NAME}-${SANITIZED_BRANCH}"
fi

# Convert to absolute path if relative
if [[ "$WORKTREE_PATH" != /* ]]; then
    WORKTREE_PATH="$(cd "$REPO_ROOT" && cd "$(dirname "$WORKTREE_PATH")" 2>/dev/null && pwd)/$(basename "$WORKTREE_PATH")" || WORKTREE_PATH="$REPO_ROOT/$WORKTREE_PATH"
fi

echo -e "${BLUE}Creating worktree for branch:${NC} $BRANCH_NAME"
echo -e "${BLUE}Worktree location:${NC} $WORKTREE_PATH"
echo ""

# Check if worktree path already exists
if [ -d "$WORKTREE_PATH" ]; then
    echo -e "${RED}Error: Directory already exists: $WORKTREE_PATH${NC}"
    exit 1
fi

# Check if branch exists locally or remotely
BRANCH_EXISTS_LOCAL=$(git show-ref --verify --quiet "refs/heads/$BRANCH_NAME" && echo "yes" || echo "no")
BRANCH_EXISTS_REMOTE=$(git show-ref --verify --quiet "refs/remotes/origin/$BRANCH_NAME" && echo "yes" || echo "no")

# Create the worktree
echo -e "${YELLOW}Step 1/4: Creating git worktree...${NC}"
if [ "$BRANCH_EXISTS_LOCAL" = "yes" ]; then
    git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
elif [ "$BRANCH_EXISTS_REMOTE" = "yes" ]; then
    git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
else
    # Branch doesn't exist, create it
    echo -e "${BLUE}Branch '$BRANCH_NAME' doesn't exist. Creating new branch from current HEAD...${NC}"
    git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH"
fi
echo -e "${GREEN}Worktree created successfully${NC}"
echo ""

# Find and copy all .env files
echo -e "${YELLOW}Step 2/4: Copying .env files...${NC}"
ENV_COUNT=0

# Use find to locate all .env* files, excluding node_modules and .git
while IFS= read -r -d '' env_file; do
    # Get relative path from repo root
    REL_PATH="${env_file#$REPO_ROOT/}"

    # Create target directory if it doesn't exist
    TARGET_DIR="$WORKTREE_PATH/$(dirname "$REL_PATH")"
    mkdir -p "$TARGET_DIR"

    # Copy the file
    cp "$env_file" "$WORKTREE_PATH/$REL_PATH"
    echo -e "  ${GREEN}✓${NC} Copied $REL_PATH"
    ENV_COUNT=$((ENV_COUNT + 1))
done < <(find "$REPO_ROOT" -name ".env*" -type f \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -path "$WORKTREE_PATH/*" \
    -print0 2>/dev/null)

if [ "$ENV_COUNT" -eq 0 ]; then
    echo -e "  ${YELLOW}No .env files found to copy${NC}"
else
    echo -e "${GREEN}Copied $ENV_COUNT .env file(s)${NC}"
fi
echo ""

# Copy .claude directory
echo -e "${YELLOW}Step 3/4: Copying .claude configuration...${NC}"
if [ -d "$REPO_ROOT/.claude" ]; then
    cp -r "$REPO_ROOT/.claude" "$WORKTREE_PATH/.claude"
    echo -e "  ${GREEN}✓${NC} Copied .claude directory"
else
    echo -e "  ${YELLOW}No .claude directory found to copy${NC}"
fi
echo ""

# Run bun install
echo -e "${YELLOW}Step 4/4: Installing dependencies with bun...${NC}"
cd "$WORKTREE_PATH"
bun install
echo -e "${GREEN}Dependencies installed successfully${NC}"
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Worktree created successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Location: ${BLUE}$WORKTREE_PATH${NC}"
echo -e "Branch:   ${BLUE}$BRANCH_NAME${NC}"
echo ""
echo -e "To start working:"
echo -e "  ${YELLOW}cd $WORKTREE_PATH${NC}"
echo ""
