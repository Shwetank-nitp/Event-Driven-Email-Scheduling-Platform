set -e

if [ -f .env ]; then
    while IFS= read -r line || [ -n "$line" ]; do
        line=$(echo "$line" | tr -d '\r' | xargs)
        
        [[ -z "$line" || "$line" == "#"* ]] && continue
        
        clean_line=$(echo "$line" | sed 's/[[:space:]]*=[[:space:]]*/=/')
        
        clean_line=$(echo "$clean_line" | sed 's/=\x22\(.*\)\x22/=\1/' | sed "s/=\x27\(.*\)\x27/=\1/")
        
        export "$clean_line"
    done < .env
else
    echo "Error: .env file missing!"
    exit 1
fi

envsubst < ./monitoring/alertmanager.template.yml > ./monitoring/alertmanager.yml

if [ "$1" == "--hard-start" ]; then
    docker compose down -v
else
    docker compose down
fi
docker compose up -d --build