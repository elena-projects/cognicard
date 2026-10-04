# Serve the pre-built Vite static app (dist/) on Cloud Run.
# The bundle carries NO API key; nginx injects GEMINI_API_KEY server-side at runtime.
FROM nginx:1.27-alpine
# nginx.conf is a template — the base image runs envsubst on /etc/nginx/templates/*.template
# at start-up, substituting ${GEMINI_API_KEY} (a Cloud Run env var). The filter keeps
# nginx's own $host / $request_uri variables intact.
COPY nginx.conf /etc/nginx/templates/default.conf.template
# The rate-limit zone lives in the http context, so it is a plain conf.d file rather than
# part of the server template. The 00- prefix makes nginx read it before default.conf,
# which refers to the zone.
COPY ratelimit.conf /etc/nginx/conf.d/00-ratelimit.conf
ENV NGINX_ENVSUBST_FILTER=GEMINI_API_KEY
COPY dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
