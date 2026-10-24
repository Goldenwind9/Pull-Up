// pm2 keeps the app running and restarts it if it crashes.
// On the server: npm ci && npm run build && pm2 start deploy/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "pullup",
      script: "npm",
      args: "start",
      env: { NODE_ENV: "production", PORT: 3000 },
    },
  ],
};
