# Use the official lightweight Nginx server image
FROM nginx:stable-alpine

# Copy the platform's build artifacts from the central /build directory
# The path is relative to the build context, which is the monorepo root.
COPY ./build/platform-app /usr/share/nginx/html

# Copy the platform's specific Nginx configuration
COPY ./apps/platform/nginx.conf /etc/nginx/conf.d/default.conf