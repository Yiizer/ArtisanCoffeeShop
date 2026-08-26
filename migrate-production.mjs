#!/usr/bin/env node
import { spawn } from 'child_process';

console.log('🗄️  Running database migrations on production...\n');

const migrate = spawn('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: true
});

migrate.on('exit', (code) => {
  if (code === 0) {
    console.log('\n✅ Migrations completed successfully!');
    console.log('\n🌱 Now seeding the database...\n');
    
    const seed = spawn('npm', ['run', 'prisma:seed'], {
      stdio: 'inherit',
      shell: true
    });
    
    seed.on('exit', (seedCode) => {
      if (seedCode === 0) {
        console.log('\n🎉 Database is ready!');
        console.log('\nYour app is now fully functional at:');
        console.log('https://artisan-coffee-shop-bsyb.vercel.app\n');
      } else {
        console.error('\n❌ Seeding failed');
        process.exit(1);
      }
    });
  } else {
    console.error('\n❌ Migration failed');
    process.exit(1);
  }
});
