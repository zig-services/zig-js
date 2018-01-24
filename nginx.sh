#!/bin/sh

cat > /tmp/zig-nginx.conf << EOF

server {
    root /app;

    location ~ /([a-z]+)(.min)?.js\$ {
        try_files /\$1/\$1.js /out/\$1.min.js =404;
    }
}

EOF

echo "You can now access the files using 'curl localhost:8001/any/path/zig.min.js'"
docker run --rm -p 8001:80 -v /tmp/zig-nginx.conf:/etc/nginx/conf.d/default.conf:ro -v $PWD:/app:ro nginx:1.13-alpine
