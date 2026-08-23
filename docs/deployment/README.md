# Deployment

Keep the same security topology on every provider: public Next.js, private Express, managed Supabase.

- [Provider-neutral setup and single-VM deployment](../setup.md)
- [Railway deployment](railway.md)

AWS EC2 and DigitalOcean Droplets use the single-VM instructions; the provider-specific work is limited to VM provisioning, firewall rules, DNS, TLS, backups, and monitoring.

Do not add a second backend replica until process-local security state has moved to shared storage.
