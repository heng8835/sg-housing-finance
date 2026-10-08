# Static web app: nginx serves the ES modules, policy JSON and pre-built data files.
# No build step, no server code.
FROM nginx:1.27-alpine
COPY . /usr/share/nginx/html/
RUN rm -f /usr/share/nginx/html/Dockerfile
EXPOSE 80
