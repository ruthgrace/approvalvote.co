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
sudo systemctl restart nginx
```
make sure nginx config context is httpd_config_t
```
sudo chcon -t httpd_config_t /etc/nginx/conf.d/approvalvote.bootstrap
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

## run in development

```
flask --app website run --host=0.0.0.0 --debug
```

## to do
* production server
* check how it looks on mobile
* feature for whether or not a poll requires email verification from voters
* voting results page - take into account ties
* incorporate design
* revisit domain reputation issue for sending verification code email
* feature for opening and closing polls
** consider caching results in results db once poll closes
* make sure there aren't duplicate options