#!/usr/bin/env bash
set -e

# Safely parse and export .env variables, immune to spacing typos
if [ -f .env ]; then
    while IFS= read -r line || [ -n "$line" ]; do
        # Remove Windows carriage returns and trim whitespace
        line=$(echo "$line" | tr -d '\r' | xargs)
        
        # Skip empty lines and comments
        [[ -z "$line" || "$line" == "#"* ]] && continue
        
        # Clean spaces around the '=' sign if they exist
        clean_line=$(echo "$line" | sed 's/[[:space:]]*=[[:space:]]*/=/')
        
        # Strip literal surrounding quotes so envsubst gets the clean value
        clean_line=$(echo "$clean_line" | sed 's/=\x22\(.*\)\x22/=\1/' | sed "s/=\x27\(.*\)\x27/=\1/")
        
        export "$clean_line"
    done < .env
else
    echo "Error: .env file missing!"
    exit 1
fi

# Run the substitution
envsubst < ./monitoring/alertmanager.template.yml > ./monitoring/alertmanager.yml

# Restart the stack
docker compose down -v
docker compose up -d