var users = require("../models/users.js");
var request = require("request");
var querystring = require("querystring");
var satelize = require("satelize");

var isUserLogged = function(req, res, next) {
  if (req.isAuthenticated()) {
    users.findOneAndUpdate({_id: req.user._id}, {$set: {userLocation: req.body.searchBar}})
      .exec(function(err) {
        if (err) 
          return next(err);
        else
          next();
        
      });
  } else {
    next();
  }
};

var getResults = function (req, res, next) {
  
  var credentials = {
    'v': '20140806',
    'client_id': process.env.CLIENT_ID,
    'client_secret': process.env.CLIENT_SECRET
  };
  
  var urlString = "https://api.foursquare.com/v2/venues/search?";
  
  var params;
  
  if(req.query.loc === "true") {
    var ll, ip = req.header('x-forwarded-for') || req.connection.remoteAddress; 
    console.log("ip is", ip);
    var url = 'http://freegeoip.net/json/' + ip;
    
    request(url, function (error, response, body) {
      if (!error && response.statusCode == 200) {
          var resp = JSON.parse(body);
          ll = resp.latitude + "," + resp.longitude;
          req.location = resp.city + ", " + resp.region_name;
          params = {
            'll' : ll.toString(),
            'query': "restaurant"
          };
          urlString += querystring.stringify(params) + '&' + querystring.stringify(credentials);
      
          request(urlString, function (error, response, results) {
            if (!error && response.statusCode == 200) {
              req.ids = JSON.parse(results).response.venues.map(function(result) { return "/venues/" + result.id });
              req.results = [];
              next();
            } else {
              next(error);
            }
          });
          
      } else {
        next(error);
      }
    });
    
  } else { 		  
    var location = req.body.searchBar;
    req.location = location;
    params = {
        'near': location,
        'query': "restaurant"
    };
    
    urlString += querystring.stringify(params) + '&' + querystring.stringify(credentials);
    
    request(urlString, function (error, response, results) {
      if (!error && response.statusCode == 200) {
        req.ids = JSON.parse(results).response.venues.map(function(result) { return "/venues/" + result.id });
        req.results = [];
        next();
      } else {
        next(error);
      }
    });
  }
  
};

var filterData = function(req, res, next) {
    
    var credentials = {
      'v': '20140806',
      'client_id': process.env.CLIENT_ID,
      'client_secret': process.env.CLIENT_SECRET
    };
    var urlString = "https://api.foursquare.com/v2/multi?requests=" + req.ids.slice(0, 10).join(',') + '&' + querystring.stringify(credentials);
    request(urlString, function (error, response, results) {
        
        if (!error && response.statusCode == 200) {
          JSON.parse(results).response.responses.forEach(function(result){
              var venue = result.response.venue;
              var obj = {};
              obj.reqLocation = req.location;
              obj.name = venue.name;
              obj.rating = venue.rating && venue.rating;
              obj.ratingColor = ("#" + venue.ratingColor);
              obj.category = venue.categories && (venue.categories.map(function(c) {return c.shortName})).join(", ");
              obj.phoneNo = venue.contact.formattedPhone;
              obj.address = venue.location.address;
              obj.city = venue.location.city;
              obj.status = venue.hereNow && venue.hereNow.summary;
              obj.tier = venue.price && venue.price.tier;
              obj.currency = venue.price && venue.price.currency;
              obj.imgUrl = venue.photos.groups[0] && (venue.photos.groups[0].items[0].prefix + '300x300' + venue.photos.groups[0].items[0].suffix);
              obj.imgUrl = obj.imgUrl ? obj.imgUrl: (venue.bestPhoto && venue.bestPhoto.prefix + '300x300' + venue.bestPhoto.suffix);
              obj.comment =  venue.tips.groups[0].items[0] && venue.tips.groups[0].items[0].text;
              obj.commentator = { 'name': venue.tips.groups[0].items[0] && ( (venue.tips.groups[0].items[0].user && venue.tips.groups[0].items[0].user.firstName) + " " + (venue.tips.groups[0].items[0].user.lastName? venue.tips.groups[0].items[0].user.lastName: "")),
                'imgUrl': obj.commentator = venue.tips.groups[0].items[0] && ( (venue.tips.groups[0].items[0].user && (venue.tips.groups[0].items[0].user.photo.prefix + '70x70' + venue.tips.groups[0].items[0].user.photo.suffix) ) )
              };
              obj.likesCount = venue.likes && venue.likes.count;
              obj.url = venue.shortUrl;
              
              var str = obj.name.split(" ").map(function(elem) {return elem[0]}).join("");
              // setting falsy values to undefined
              obj.name = obj.name ? obj.name : undefined;
              obj.rating = obj.rating ? obj.rating : undefined;
              obj.ratingColor = obj.ratingColor ? obj.ratingColor : undefined;
              obj.category = obj.category ? obj.category : undefined;
              obj.phoneNo = obj.phoneNo || undefined;
              obj.address = obj.address || undefined;
              obj.city = obj.city || undefined;
              obj.status = obj.status || undefined;
              obj.tier = obj.tier || undefined;
              obj.currency = obj.currency || undefined;
              obj.imgUrl = obj.imgUrl || "http://placehold.it/100?text="+ str;
              obj.comment =  obj.comment || undefined;
              obj.commentator = obj.commentator || undefined;
              obj.likesCount = obj.likesCount || undefined;
              obj.url = obj.url || undefined;
              
              req.results.push(obj);
          });
          
          next();
        } else {
          next(error);
        }
    
    });
};


var showResults = function(req, res) {
  res.render('./pages/resultsPage', {
            title: "Results for " + req.location + " - foodiebay",
            user: req.user,
            results: req.results
        });
   delete req.results;
   delete req.ids;
   delete req.location;
};

module.exports = function(app) {
    app.route('/results')
    		.post(isUserLogged, getResults, filterData, showResults);
};