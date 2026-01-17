// PM2 Ecosystem Configuration for AWS EC2
module.exports = {
  apps: [
    {
      name: 'petrolink-backend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 5000',
      cwd: '/home/ubuntu/cng-backend',
      instances: 1,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: '/home/ubuntu/.pm2/logs/petrolink-error.log',
      out_file: '/home/ubuntu/.pm2/logs/petrolink-out.log',
      log_file: '/home/ubuntu/.pm2/logs/petrolink-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],

  deploy: {
    production: {
      user: 'ubuntu',
      host: '13.61.177.95',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/cng.git',
      path: '/home/ubuntu/cng-backend',
      'pre-deploy-local': '',
      'post-deploy':
        'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
  },
};
