#!/bin/sh

cat > /tmp/zig-nginx.conf << EOF

map \$uri \$rewritten_content_type {
    "~\.css\$" "text/css";
    "~\.html\$" "text/html";
    "~\.js\$" "application/javascript";
    "~\.json\$" "application/json";
    default "";
}

server {
    root /app;

    location /github/ {
        proxy_hide_header "X-Frame-Options";
        proxy_hide_header "Content-Security-Policy";
        proxy_hide_header "Content-Type";
        proxy_pass "https://srv-git-01-hh1.alinghi.tipp24.net/";

        add_header "Content-Type" \$rewritten_content_type;
    }

    location ~ ^/([a-z]+)(.min)?.js\$ {
        try_files /\$1/\$1.js /out/\$1.min.js =404;
    }
}

EOF

PORT=${1:-8001}

echo "You can now access the files using 'curl localhost:8001/any/path/zig.min.js'"
echo "Also you can serve a frontend directly from github by using the /github prefix:"
echo "  http://localhost:$PORT/github/raw/zig/zig-supercashbuster-mylotto24/master/frontend/tipp24_com/game/outer.html"
echo ""
docker run --rm -p $PORT:80 -v /tmp/zig-nginx.conf:/etc/nginx/conf.d/default.conf:ro -v $PWD:/app:ro nginx:1.13-alpine
