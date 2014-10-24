var express     = require('express'),
    tls         = require('tls'),
    fs          = require('fs'),
    url         = require('url'),
    app         = express(),
    fs          = require('fs'),
    bodyParser  = require('body-parser')
    port        = process.env.PORT || 3000,
    sslPort     = process.env.SSLPORT || 3001;

var options = {
    // from : http://nodejs.org/api/tls.html
    // mkdir cert
    // cd cert
    // openssl genrsa -out websocket-key.pem 2048
    // openssl req -new -key websocket-key.pem -out websocket-csr.pem
    // openssl x509 -req -in websocket-csr.pem -signkey websocket-key.pem -out websocket-cert.pem

    // INDIVIDUAL FILES
    /*
    key: fs.readFileSync('cert/websocket-key.pem'),
    cert: fs.readFileSync('cert/websocket-cert.pem'),
    // use same key as we are using self signed
    ca: [ fs.readFileSync('cert/websocket-cert.pem') ]
    */

    // OR USE PFX
    // openssl pkcs12 -export -in websocket-cert.pem -inkey websocket-key.pem -certfile websocket-cert.pem -out websocket.pfx
    pfx: fs.readFileSync('cert/websocket.pfx')

};

var http        = require('http').Server(app),
    https       = require('https').createServer(options, app),
    io          = require('socket.io')();

// attach both https and http to the io socket
io.attach(http);
io.attach(https);

http.listen(port,function(){
    console.log('Express HTTP server listening on port %d',port);
});

https.listen(sslPort, function(){
  console.log("Express HTTPS server listening on port " + sslPort);
});

// parse application/x-www-form-urlencoded
// app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.urlencoded({extended:true}));

// Routing
app.use(express.static(__dirname + '/public'));

// external messages
app.post('/push',function(req, res){

    // console.log("[200] " + req.method + " to " + req.url);

    try{
        // if post to channel or global
        if (req.body.channel)
            io.sockets.to(req.body.channel).emit('new message',{message:req.body.message,username:'server'});
        else
            io.sockets.emit('new message',{message:req.body.message,username:'server'});
        res.json({'success':true});
    }
    catch(e){
        res.json({'success':false});
    }

});

// Chatroom

// usernames and count
var usernames       = {},
    numUsers        = {};


io.on('connection',function(socket){

    var channel     = url.parse(socket.handshake.url, true).query.channel,
        addedUser   = false;

    if (!numUsers[channel])
        numUsers[channel] = 0;
    if (!usernames[channel])
        usernames[channel] = {};

    socket.join(channel);

    // when the client emits 'new message'
    socket.on('new message',function(data){
        // emit the message to the other subscribers
        socket.broadcast.to(channel).emit('new message',{
            username    : socket.username,
            message     : data
        });
    });

    // when client emits add user
    socket.on('add user',function(username){
        // we store the user in the socket session for this client
        socket.username = username;
        // add the client's username to the global list
        if(Object.keys(usernames[channel]).indexOf(username) === -1){
            usernames[channel][username] = username;
            ++numUsers[channel];
            addedUser = true;
            socket.emit('login',{
                numUsers        : numUsers[channel],
                participants    : usernames[channel]
            });
            // echo globally (all clients) that a person has connected
            socket.broadcast.to(channel).emit('user joined',{
                username : socket.username,
                numUsers : numUsers[channel]
            });
        } else {
            socket.emit('bad-login');
        }
    });

    // when client emits typing
    socket.on('typing',function(){
        socket.broadcast.to(channel).emit('typing',{
            username:socket.username
        });
    });

    // when client emits stop typing
    socket.on('stop typing',function(){
        socket.broadcast.to(channel).emit('stop typing',{
            username:socket.username
        });
    });

    // when the user disconnects
    socket.on('disconnect', function(){
        // remove the username
        if (addedUser){
            delete usernames[channel][socket.username];
            --numUsers[channel];
            // echo globally that the client left
            socket.broadcast.to(channel).emit('user left',{
                username : socket.username,
                numUsers : numUsers[channel]
            });
        }
    });

});