#!/usr/bin/env bash

HERE=$(pwd)
MESSENGER_LAMBDA_DIR="$HERE/lambda/messenger"
LAMBDA_LAYER_DIR="$HERE/bin/layer"


# ========================================================================
# Ensure Dependencies are installed
# ========================================================================
if ! command -v cdk &> /dev/null; then
    echo "❌ CDK is not installed or not in PATH"
    exit 1
fi

if ! command -v zip &> /dev/null; then
    echo "❌ zip is not installed or not in PATH"
    exit 1
fi

if ! command -v sha256sum &> /dev/null; then
    echo "❌ sha256sum is not installed or not in PATH"
    exit 1
fi

if [ ! -d "$MESSENGER_LAMBDA_DIR" ]; then
    echo "❌ $MESSENGER_LAMBDA_DIR does not exist"
    exit 1
fi

# ========================================================================
# Functions
# ========================================================================

# Function to calculate directory hash, excluding the .zip file
calculate_hash() {
    find "$1" -type f ! -name '*.zip' -exec sha256sum {} + | sort | sha256sum | awk '{ print $1 }'
}

calculate_metadata_hash() {
    find "$1" -type f ! -name '*.zip' -printf '%s %T@ %p\n' | sort | sha256sum | awk '{ print $1 }'
}

# Function to zip lambda if changes are detected
zip_lambda() {
    local LAMBDA_DIR=$1
    local HASH_FILE=$2
    local ZIP_NAME="$LAMBDA_DIR/lambda.zip"

    echo "Calculating hash for $LAMBDA_DIR..."
    local current_hash=$(calculate_hash "$LAMBDA_DIR")
    echo "Current hash: $current_hash"

    # Check if hash file exists
    if [ -f "$HASH_FILE" ]; then
        local last_hash=$(cat "$HASH_FILE")
        echo "Last hash from file $HASH_FILE: $last_hash"

        # Compare hashes
        if [ "$current_hash" == "$last_hash" ]; then
            echo "No changes detected in $LAMBDA_DIR. Skipping zipping."
            return
        else
            echo "Changes detected in $LAMBDA_DIR."
        fi
    else
        echo "No previous hash found for $LAMBDA_DIR. Proceeding with zipping."
    fi

    # Zip the lambda
    echo "Zipping files in $LAMBDA_DIR..."
    rm -f "$ZIP_NAME"
    (cd "$LAMBDA_DIR" && zip -r lambda.zip .)
    mv "$LAMBDA_DIR/lambda.zip" "$ZIP_NAME"

    # Update hash file
    echo "$current_hash" > "$HASH_FILE"
    echo "Updated hash saved to $HASH_FILE."
}

# ========================================================================
# Calculate zip hashes
# ========================================================================

# Process image-batcher

zip_lambda "$MESSENGER_LAMBDA_DIR" "$MESSENGER_LAMBDA_DIR/hash.txt"

zip_lambda "$LAMBDA_LAYER_DIR" "$LAMBDA_LAYER_DIR/hash.txt"

# ========================================================================
# Set up .env file
# ========================================================================

echo "Cleaning up old .env-deploy"
if [ -f "$HERE/.env-deploy" ]; then
    rm "$HERE/.env-deploy"
fi

# Copy .env to .env-deploy

echo "Copying .env to .env-deploy"
cp "$HERE/.env" "$HERE/.env-deploy"

# Update TMP_DIR and IS_LOCAL

echo "Updating TMP_DIR and IS_LOCAL"

# Add newline to insure that the last line is not overwritten

echo "" >> "$HERE/.env-deploy"
echo "" >> "$HERE/.env-deploy"

# Add database env variables

echo "TMP_DIR=/tmp/vectopus-messenger" >> "$HERE/.env-deploy"
echo "IS_LOCAL=false" >> "$HERE/.env-deploy"

# Source .env-deploy
echo "Sourcing .env-deploy"
source "$HERE/.env-deploy"

# ========================================================================
# Deploy
# ========================================================================

# Run cdk deploy
echo "Deploying"
cdk deploy

# Re-source .env
echo "Restore .env"
source "$HERE/.env"

echo "Done"