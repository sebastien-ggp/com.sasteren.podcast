'use strict';

const Homey = require('homey');
const dateformat = require('dateformat');
var FeedMe = require('feedme');
var http = require('http');
//var https = require('https');
//var httpmin = require ('http.min');
//var data = []; //array with media-objects
var urllist = []; //array with {name,url,latestbroadcast,latesturl,token} feeds from settings
		
class Vodcast extends Homey.App {
	
	onInit() {
		this.log('Vodcast starting');
		
		getsettings().then(function(results) {
			console.log("settings read");
			urllist=results;
			console.log(urllist);
			readfeeds().then(function(results) {
				console.log("feeds read from start");			
			})	
		});

		startPollingForUpdates();
		
		Homey.ManagerSettings.on('set', function(settings) {
			getsettings().then(function(urlsettings) {
				console.log("settings read");
				urllist=urlsettings;
				//console.log(urllist);
				readfeeds().then(function(results) {
					console.log("feeds read from changing settings");
				})		
			});
		});
		
	}
}

async function readfeeds() {
		var temparray = [];
		//console.log("items in urllist ", urllist.length);
		for(var i = 0; i < urllist.length; i++) {
				var obj = urllist[i];
				//console.log("readfeed ", obj.url);
				var item = await readfeed(obj.url);
				temparray.push (item);
		};
		return temparray;
};
	
function readfeed(url) {
	return new Promise(resolve => {
			http.get(url, function(res) {
				var parser = new FeedMe(true);
				var teller=0;
				
				parser.on('item', (item) => {
					if (teller === 0) { //only on first item
						var objIndex = urllist.findIndex((obj => obj.url == url));
						console.log(objIndex);
						if (urllist[objIndex].latestbroadcast != null) { //already a latest url in tag
							var oldtimestamp = urllist[objIndex].latestbroadcast;
							var oldurl=urllist[objIndex].latesturl;
							var newtimestamp = Date.parse(item.pubdate)/1000;
							if (newtimestamp > oldtimestamp) { //new item
								urllist[objIndex].latestbroadcast = newtimestamp
								urllist[objIndex].token.setValue(item.enclosure.url);
								urllist[objIndex].latesturl = item.enclosure.url;
								
								//here a trigger should be fired
								let tokens = {
									'item': item.enclosure.url,
									'tijd': item.pubdate,
									'vctitle': urllist[objIndex].name,
								}
								console.log(tokens);
								//console.log(urllist[objIndex].flowTriggers.newvodcast);
								urllist[objIndex].flowTriggers.newvodcast.trigger(tokens).catch( this.error );
								
								
							} else {
								//no new item
							}
						} else { //set first url in tag
							urllist[objIndex].token.setValue(item.enclosure.url);						
							urllist[objIndex].latesturl = item.enclosure.url;
							urllist[objIndex].latestbroadcast = Date.parse(item.pubdate)/1000;
						}
						teller=teller+1; //only first item
					};	
				});
								
				res.pipe(parser);			

				parser.on('end', function() {
					var pl = parser.done();
					var result = {
						type: 'playlist',
						id: pl.title,
						title: pl.title,
						tracks: parseTracks(pl.items) || false,
					};

				resolve(result);
				});	
			});		
	});
};

function startPollingForUpdates() {
	var pollingInterval = setInterval(() => {
		console.log('start polling');
			readfeeds().then(function(results) {
				console.log("feeds read from polling");
				//data=results;
				//console.log(results);
				//Homey.ManagerMedia.requestPlaylistsUpdate();
			})	
	}, 900000);
};

//get name and url list from settings and create array
function getsettings() {
	return new Promise(function(resolve,reject){
		var replText = Homey.ManagerSettings.get('vodcasts');
		var list = [];
		if (replText != null && typeof replText === 'object') {
			Object.keys(replText).forEach(function (key) {
				var url = replText[key];
				list.push( {"name":key,"url":url})
				return list;
			});
		
		list.forEach(function(listobject) {
			var objIndex = urllist.findIndex(obj => obj.url == listobject.url);
			console.log ("objIndex ", objIndex, "in urllist voor ",listobject.url);
			if (objIndex > -1) {
				console.log("gegevens overnemen");
				listobject.latestbroadcast = urllist[objIndex].latestbroadcast;
				listobject.latesturl = urllist[objIndex].latesturl;
				listobject.token = urllist[objIndex].token;
				listobject.flowTriggers = urllist[objIndex].flowTriggers
			} else {
				listobject.latestbroadcast = null;
				listobject.latesturl = "";
				listobject.token = new Homey.FlowToken( listobject.name, {
						type: 'string',
						title: listobject.name
					});
				listobject.token.register()
					.then(() => {
						return listobject.token.setValue( null );
					})
				listobject.flowTriggers = {newvodcast: new Homey.FlowCardTrigger('new_vodcast_item')};
				listobject.flowTriggers.newvodcast.register();
			}
		});
		
		if (urllist.length > 0) {
		urllist.forEach(function(listobject) {
			var objIndex = list.findIndex(obj => obj.url == listobject.url);
			console.log("listobject in lijst ", objIndex);
			if (objIndex < 0) {
				//not found so delete
				//console.log("url niet gevonden dus verwijderen");
				listobject.token.unregister()
					.then(() => {
						console.log("token unregistered");
					})
			} else {
				//console.log("url gevonden dus niets doen");
				//wel gevonden dus niets doen
			}
		});
		}
		
		resolve(list);	
		}
	})
}	


	
	
function parseTracks(tracks) {
	const result = [];
	if (!tracks) {
		return result;
	}
	tracks.forEach((track) => {
		const parsedTrack = parseTrack(track);
		if (parsedTrack !== null) {
			parsedTrack.confidence = 0.5;
			result.push(parsedTrack);
		}
	});
	return result;
}

function parseTrack(track) {

	if(typeof track.enclosure == 'undefined' || typeof track.enclosure.url == 'undefined'){
		return null
	}
	
	if(typeof track['itunes:duration'] !== 'undefined'){
		var itemduration = hmsToSecondsOnly(track['itunes:duration']);
	}
	
	console.log(track['media:content']);
	return {
		type: 'track',
		id: track.enclosure.url,
		title: track.title,
		artist: [
			{
				name: track['itunes:author'],
				type: 'artist',
			},
		],
		duration:  itemduration || null,		
		artwork: '',
		genre: track.genre || 'unknown',
		release_date: dateformat(track.pubdate, "yyyy-mm-dd"),
		codecs: ['homey:codec:mp4'],
		bpm: track.pbm || 0,
		options :  
			{
			url : track.enclosure.url
			}
		
	}
}

function hmsToSecondsOnly(str) {
	if (str != null) {
		//console.log(str);
    var p = str.split(':'),
        s = 0, m = 1;
    while (p.length > 0) {
        s += m * parseInt(p.pop(), 10);
        m *= 60;
    }
	s=s*1000
	//console.log(s);
	} else {s=null}
    return s;
}

module.exports = Vodcast;