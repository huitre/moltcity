// PM2 configuration for production
module.exports = {
  apps: [{
    name: 'moltcity',
    script: 'src/api/server.ts',
    interpreter: 'npx',
    interpreter_args: 'tsx',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    instances: 1, // SQLite doesn't support multiple instances
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true
  }]
};
