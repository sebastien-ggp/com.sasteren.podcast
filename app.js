'use strict';

const Homey = require('homey');
const dateformat = require('dateformat');
var FeedMe = require('feedme');
var http = require('http');
//var https = require('https');
//var httpmin = require ('http.min');
var data = []; //array with media-objects
var urllist = []; //array with {name,url,latestbroadcast,latesturl,token} feeds from settings
		
class Podcast extends Homey.App {
	
	onInit() {
		this.log('Podcast starting');
		
		getsettings().then(function(results) {
			console.log("settings read");
			urllist=results;
			console.log(urllist);
			readfeeds().then(function(results) {
				console.log("feeds read from start");
				data=results;
				Homey.ManagerMedia.requestPlaylistsUpdate();
			})	
		});

		startPollingForUpdates();

		Homey.ManagerMedia.on('getPlaylists', (callback) => {
			console.log('get playlists');
			return callback(null, data);
		});	

		Homey.ManagerMedia.on('getPlaylist', (request, callback) => {
			console.log('get playlist');
			return callback(null, data);
		});

		Homey.ManagerMedia.on('play', (objectid, callback) => {
			console.log(objectid);
			var urlobj= { stream_url : objectid.trackId };
			console.log(urlobj);			
			return callback(null, urlobj);
		});
		
		Homey.ManagerSettings.on('set', function(settings) {
			getsettings().then(function(urlsettings) {
				console.log("settings read");
				urllist=urlsettings;
				//console.log(urllist);
				readfeeds().then(function(results) {
					console.log("feeds read from changing settings");
					data=results;
					console.log(results);
					Homey.ManagerMedia.requestPlaylistsUpdate();
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
									'podcast': urllist[objIndex].name,
									'item': item.enclosure.url,
									'tijd': item.pubdate
								}		
								console.log(urllist[objIndex].flowTriggers);
								urllist[objIndex].flowTriggers.newpodcast.trigger(tokens).catch( this.error );
								
								
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
				//console.log("feeds read from polling");
				data=results;
				//console.log(results);
				Homey.ManagerMedia.requestPlaylistsUpdate();
			})	
	}, 900000);
};

//get name and url list from settings and create array
function getsettings() {
	return new Promise(function(resolve,reject){
		var replText = Homey.ManagerSettings.get('podcasts');
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
				listobject.flowTriggers = {newpodcast: new Homey.FlowCardTrigger('new_podcast_item')};
				listobject.flowTriggers.newpodcast.register();
			}
		});
		
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
		parsedTrack.confidence = 0.5;
		result.push(parsedTrack);
	});
	return result;
}

function parseTrack(track) {
	var itemduration = hmsToSecondsOnly(track['itunes:duration']);
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
		codecs: ['homey:codec:mp3'],
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

module.exports = Podcast;