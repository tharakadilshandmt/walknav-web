FROM nginx:1.27-alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy production Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
