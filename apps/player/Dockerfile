# Użyjemy oficjalnego, lekkiego obrazu serwera Nginx
FROM nginx:stable-alpine

# IMPORTANT: The COPY path is now relative to the project root,
# because we will configure docker-compose this way.
# Copy the ready-made application artifacts to the folder served by Nginx.
COPY ./build/player-app /usr/share/nginx/html

# Copy our Nginx configuration to properly handle the Single Page Application.
COPY ./apps/player/nginx.conf /etc/nginx/conf.d/default.conf