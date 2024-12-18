# photos-liveshow
This program serves a website that allows you to provide access to a Google Photos album and create a live slideshow using the images in that album. It will constantly update and show images as they are added.

# deploy

1. Edit the `.env` file to include your values and the production url
2. Build the React front-end with:
```
npm run build
```
3. Edit the `photos-liveshow.service` file to match your current config
4. Add the service file to systemd:
```
sudo cp ./photos-liveshow.service /etc/systemd/system/photos-liveshow.service
```
5. Reload, enable, and then start the service:
```
sudo systemctl daemon-reload
sudo systemctl enable photos-liveshow.service
sudo systemctl start photos-liveshow.service
```
6. Check to ensure it is running:
```
sudo systemctl status photos-liveshow.service
```
