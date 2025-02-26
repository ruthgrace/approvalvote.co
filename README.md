# approval voting website

# dev
## set up on new server
i have an almalinux server. the default python is 3.9 but i also have 3.12 so i can use fstrings

`pip3.12 install virtualenv` if necessary

```
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

use nginx/approvalvote.bootstrap to set up letsencrypt ssl certs for https
```
sudo ln -s /var/www/approvalvote.co/nginx/approvalvote.bootstrap /etc/nginx/conf.d/approvalvote.conf
```
make sure config works
```
sudo nginx -t
```
restart nginx
```
sudo systemctl reload nginx
```
make sure nginx config context is httpd_config_t
```
sudo chcon -t httpd_config_t /etc/nginx/conf.d/approvalvote.conf
sudo semanage fcontext -a -t httpd_config_t "/etc/nginx/conf.d(/.*)?"
sudo restorecon -Rv /etc/nginx/conf.d
```

ensure webroot context is httpd_sys_content_t
```
sudo semanage fcontext -a -t httpd_sys_content_t "/var/www/approvalvote.co(/.*)?"
sudo restorecon -Rv /var/www/approvalvote.co
```
make ssl certs
```
sudo certbot certonly --force-renewal -a webroot -w /var/www/approvalvote.co -d approvalvote.co -d www.approvalvote.co
```

install production nginx config
```
rm /etc/nginx/conf.d/approvalvote.conf
sudo ln -s /var/www/approvalvote.co/nginx/approvalvote.conf /etc/nginx/conf.d/approvalvote.conf
sudo nginx -t
sudo systemctl reload nginx
```

make approvalvote user to run the service in production
```
sudo useradd -M -s /sbin/nologin approvalvote
sudo usermod -aG nginx approvalvote
```

make it so that personal user and approvalvote user can both run the service via approvalvote_group
```
sudo groupadd approvalvote_group
sudo usermod -aG approvalvote_group ruth
sudo usermod -aG approvalvote_group approvalvote
```

make sure approvalvote_group has the right permissions
```
sudo chown -R approvalvote:approvalvote_group /var/www/approvalvote.co
sudo chmod -R 755 /var/www/approvalvote.co
sudo chmod -R g+w /var/www/approvalvote.co
sudo chmod -R g+s /var/www/approvalvote.co
```

tell git it's ok that you don't own the directory
```
git config --global --add safe.directory /var/www/approvalvote.co
```

make sure nginx has permission to run gunicorn and connect to local 8000 port
```
sudo semanage fcontext -a -t bin_t "/var/www/approvalvote.co/venv/bin(/.*)?"
sudo restorecon -Rv /var/www/approvalvote.co/venv/bin
sudo setsebool -P httpd_can_network_connect on
sudo systemctl restart nginx
```

add systemctl service file. note that it's copied instead of symlinked because systemctl doesn't support symlinks unless the file has the right ownership and permissions
```
sudo cp /var/www/approvalvote.co/approvalvote.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable approvalvote
sudo systemctl start approvalvote
sudo systemctl status approvalvote
```
### DNS

don't forget to make DMARC, DKIM, SPF, and MX records so that email verification works

### troubleshooting

#### check status
```
sudo systemctl status approvalvote
```

#### follow logs
```
sudo journalctl -u approvalvote -f
```

#### restart
```
sudo systemctl restart approvalvote
```

#### cursor/vs code doesn't have permission to change files

last time i added myself to the production group (approvalvote_group) i also had to clean up all the vs code and cursor files before logging in via vs code or cursor would have the correct group so i could edit files
```
First, let's see all running VS Code related processes on the server:
ps aux | grep -i "code\|cursor"
Kill all VS Code and Cursor servers:
pkill -f "code-server"
pkill -f "vscode-server"
pkill -f "cursor"
Check if any SSH sessions are still hanging:
ps aux | grep ssh
On your local machine, completely quit both VS Code and Cursor
Clean up any leftover VS Code/Cursor directories on the server:
exists
rm -rf ~/.vscode-server
rm -rf ~/.cursor-server  # if it exists
Then try a fresh connection:
SSH in via terminal first
Check groups are correct
Start VS Code fresh
Connect to the server
```

## run in development

```
flask --app website run --host=0.0.0.0 --debug
```

## run tests
```
pytest tests/test_integration.py -v
```

## to do
* fix text overlap bug for results chart labels e.g. https://approvalvote.co/results/56
* tailwind production
* revisit domain reputation issue for sending verification code email - need to switch to google suite instead of namecheap private email (and update dns records)
* unit testing for existing features
* feature for opening and closing polls
* make sure there aren't duplicate options
* edit poll
** delete poll from database option
** view voters for a poll (but maybe hide what they voted for)