# Serve the pre-built Vite static app (dist/) on Cloud Run.
# dist/ is built locally so the GEMINI_API_KEY is already baked in by Vite,
# matching how AI Studio's deploy-container serves the app.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
