angular.module('sound', [])

/**
 * Service providing playback and mpd queue functionality 
 */
.factory('mpdAssist', function($http, $log, $rootScope, $q, contentFormatting) {

	/**
	* Check if the system is connected to the MPD instance
	*
	* @return integer
	*/
	function checkConnection()
	{
	    var mpdState = mpdClient.getState();

	    if (mpdState.connected) {
	    	return 1;
	    } else {
	    	return 0;
	    }		
	}

	/**
	* Get details about the currently playing song
	*
	* @return object songObj 
	*/
	function getPlaying()
	{
		var currentSong = mpdClient.getCurrentSong();

		if (currentSong) {
			var songArtist = currentSong.getArtist();
			var albumArt = findAlbumArt(songArtist, 'feature');
			var trackMetadata = currentSong.getMetadata();

			var songObj = {
	            'id' :  currentSong.getId(),
	            'name' :  currentSong.getDisplayName(),
	            'playTime' : {
	            				'formatted': contentFormatting.formatSeconds(mpdClient.getCurrentSongTime()),
	            				'raw': mpdClient.getCurrentSongTime()
	            			},   	            
	            'duration' : {
	            				'formatted': contentFormatting.formatSeconds(currentSong.getDuration()),
	            				'raw': currentSong.getDuration() 
	            			},    				
	            'artist' : songArtist,
	            'album' : currentSong.getAlbum(),
	            'year' : trackMetadata.date,
	            'image' : albumArt,
				'next' : false,
				'paused' : 0
	        }

	        var nextSong = mpdClient.getNextSong();

	        if (nextSong) {

	        	var albumArt = findAlbumArt( nextSong.getArtist() );
				var trackMetadata = nextSong.getMetadata();

				var nextSongObj = {
		            'id' :  nextSong.getId(),
		            'name' :  nextSong.getDisplayName(),
		            'duration' : contentFormatting.formatSeconds(nextSong.getDuration()),
		            'artist' : nextSong.getArtist(),
		            'album' : nextSong.getAlbum(),
		            'queueid' : nextSong.getQueuePosition(),
		            'year' : trackMetadata.date,
		            'image' : albumArt
		        }	

		        songObj.next = nextSongObj;
	        }
	        return songObj;
		}
		
	}

	/**
	* Find the album art for an artist
	*
	* @param string artistName
	* @param string imageSize - Possible values original, feature or big
	*
	* @return string albumArt
	*/
	function findAlbumArt( artistName, imageSize ) 
	{	     	
        if (typeof artistName === 'undefined'){

          var albumArt = '/img/no_image.png';

        } else {
	        var artistSlug = artistName.toLowerCase(artistName.replace(/\W/g, ''));      	

	        var artworkStore = window.localStorage['album_art'];
	   
	        if (artworkStore) {

	            var artworkStore = JSON.parse(artworkStore);

	            if (typeof artworkStore[artistSlug] === 'undefined') {

					albumArtRequest( artistName, artworkStore );	         
						
	            } else {
	            	var artistCover = artworkStore[artistSlug];

	            	if (imageSize) {
		            	switch (imageSize) {
		            		case 'original':
		            			var albumArt = artistCover.original;
		            		break;

		            		case 'feature':
		            			var albumArt = artistCover.feature;
		            		break;

		            		case 'big':
		            			var albumArt = artistCover.big;
		            		break;

		            		default:
		            			var albumArt = artistCover.original;
		            	}	            		
	            	} else {
	            		var albumArt = artistCover.original;
	            	}


	            }
	        } else {
				albumArtRequest( artistName, artworkStore );	        	
	        } 
		}
			
		if (typeof albumArt === 'undefined') {
			var albumArt = '/img/no_image.png';
		}	
		
        return albumArt;
	}

	/**
	* Check is request has already been made for this artists album art
	* If not make a request to itunes
	*
	* @param string artistName
	* @param object artworkStore
	*/
	function albumArtRequest( artistName, artworkStore )
	{
		var artistSlug = artistName.toLowerCase(artistName.replace(/\W/g, ''));    

		var getAlbumArt = function( artistName ) {
			var url = 'https://itunes.apple.com/search?term=' + artistName + '&limit=1&media=music&entity=musicArtist,album' + '&callback=JSON_CALLBACK';
			console.log('Trying to find image for:' + url);

		   	return $http({
		   	  	method: 'JSONP',
		   	  	url: url
		   	});
		}

		if (typeof artworkStore === 'undefined') {
			var artworkStore = {};
		}

		if( typeof artworkStore[artistSlug] !== 'undefined' && typeof artworkStore[artistSlug].requested !== 'undefined' ) {

			var timeDiff = (Math.floor(Date.now() / 1000)) - artworkStore[artistSlug].requested;

			if (timeDiff < 600) {
				return;
			}
		}

		artworkStore[artistSlug] = {
    		'requested' : Math.floor(Date.now() / 1000),
    	};

		window.localStorage['album_art'] = JSON.stringify( artworkStore );

		getAlbumArt(artistName).then(function(res){
		  var albumArt = res.data.results.pop();

		  var addAlbumArt = function( artistSlug, imageUrl ) {
			if (imageUrl) {
		        var albumArt = window.localStorage['album_art'];

		        if (albumArt) {
		            var albumArt = JSON.parse(albumArt);
		        } else {
		        	var albumArt = {};
		        }

		        var bigImage = imageUrl.replace("100x100", "200x200");
		        var featureImage = imageUrl.replace("100x100", "150x150");        

		        albumArt[artistSlug] = {
		        	'original' : imageUrl,
		        	'feature' : featureImage,
		        	'big' : bigImage
		        };

				window.localStorage['album_art'] = JSON.stringify(albumArt);
			}
		  }

		  if ( (typeof albumArt.artworkUrl100 !== "undefined") && (albumArt.artworkUrl100.length > 0) ) {
			addAlbumArt(artistSlug, albumArt.artworkUrl100);		  	
		  } else {
			addAlbumArt('/img/no_image.png', albumArt.artworkUrl100);
		  }
		});	 	
	}

	/**
	* Find playlists within the MPD filesystem
	*
	* @param string dirPath
	* 
	* @return object directoryPlaylists	
	*/	
	function getDirectoryPlaylists( dirPath )
	{
		var directoryPlaylists = [];

		mpdClient.getDirectoryContents(dirPath, function(directoryFiles){

			directoryFiles.forEach(function(directoryItem){
				var metaData = directoryItem.getMetadata();

				if ((typeof metaData.playlist != 'undefined')) {
					if (metaData.playlist.includes("xspf")) {

						var itemData = {
							'type' : 'playlist',
							'name' : metaData.playlist.replace(".xspf", ""),
							'path' : metaData.playlist
						}			

						directoryPlaylists.push(itemData);
					}
				} 
			});
    	});

		return directoryPlaylists;
	}

	/**
	* Get the contents of a directory on the MPD filesystem
	*
	* @param string dirPath
	* 
	* @return object directoryContents
	*/	
	function getDirectory( dirPath )
	{
		var directoryContents = [];
		var directoryIndexes = [];

		mpdClient.getDirectoryContents(dirPath, function( directoryFiles ) {

			directoryFiles.forEach(function(directoryItem){
				var metaData = directoryItem.getMetadata();

				if ((typeof metaData.directory === 'undefined') && (typeof metaData.playlist === 'undefined')) {
					var artistName = directoryItem.getArtist();
					
					if ((typeof artistName != 'undefined') && (artistName.charAt(0).match(/[a-z0-9]/i))) {
						var itemIndex = artistName.charAt(0);
					} else {
						var itemIndex = ' ';
					}

					var objPath = directoryItem.getPath();
						
					var albumArt = findAlbumArt(directoryItem.getArtist());
					var trackMetadata = directoryItem.getMetadata();

					var itemData = {
						'type' : 'file',
						'path' : objPath,
						'index' : itemIndex.toLowerCase(),
						'artist' : artistName,
						'name' :  directoryItem.getDisplayName(),
						'album' : directoryItem.getAlbum(),
						'track' : directoryItem.getTrack(),
						'duration' : contentFormatting.formatSeconds(metaData.time),
						'artwork' : albumArt,
						'year' : trackMetadata.date
					}

				} else {
					var objPath = directoryItem.getPath();

					if (typeof objPath != 'undefined') {
						var dirName = objPath.replace(/\//g, '<br />');					

						if (dirName.charAt(0).match(/[a-z0-9]/i)) {
							var itemIndex = dirName.charAt(0);
						} else {
							var itemIndex = ' ';
						}

						var itemData = {
							'name' : dirName,
							'type' : 'directory',
							'path' : objPath,
							'index' : itemIndex.toLowerCase(),
							'link' : encodeURIComponent(objPath.replace("/", "@!@")),
							'artwork' : '/img/folder.png'
						}
					}
				}

				if ( ( typeof itemData !=="undefined" ) && ( typeof itemData.index !=="undefined" ) && itemData.index != " " ) {
					if ( !directoryIndexes.includes(itemData.index) ) {
						directoryIndexes.push( itemData.index );
					} 
				}	
				directoryContents.push( itemData );
			});

    	});

		return { directoryContents, directoryIndexes };
	}

	/**
	* Get the contents of the current play queue
	*
	* @return array playlistSongs
	*/
	function getQueue()
	{
		var mpdQueue = mpdClient.getQueue();
		var playlistSongs = [];
		var currentSong = mpdClient.getCurrentSongID();

	  	if (mpdQueue) {
			playlistPostition = 0;
	    	mpdQueue.getSongs().forEach(function(playlistSong){
	        	var songArtist = playlistSong.getArtist();

				if ((currentSong === playlistSong.getId()) && (mpdClient.getCurrentSongTime() > 0) && (mpdClient.getCurrentSongTime() < playlistSong.getDuration())) {
					var songStatus = 1;
				} else {
					var songStatus = 0;
				}

				var albumArt = findAlbumArt(songArtist);
				var trackMetadata = playlistSong.getMetadata();

				var songObj = {
		            'id' :  playlistSong.getId(),
					'position' : playlistPostition,
		            'name' :  playlistSong.getDisplayName(),
		            'duration' : contentFormatting.formatSeconds(playlistSong.getDuration()),
		            'artist' : songArtist,
		            'album' : playlistSong.getAlbum(),
		            'image' : albumArt,
					'playing' : songStatus,
					'year' : trackMetadata.date,
					'playTime' : 0
		        }

		        if (songStatus === 1) {
		        	songObj.playTime = contentFormatting.formatSeconds(mpdClient.getCurrentSongTime());
		        }

		        playlistSongs.push(songObj);

				playlistPostition++;
	    	});

		}

		return playlistSongs;
	}

	return {
		checkConnection: function() {
			
			return checkConnection();
		},

		getDirectory: function( dirPath ) {

	       return getDirectory(dirPath);
	    },

		getDirectoryPlaylists: function( dirPath ) {

	       return getDirectoryPlaylists(dirPath);
	    },

		getQueue: function() {

	       return getQueue();
	    },

	    getPlaying: function() {

	    	return getPlaying();
	    },

	    checkAlbumArt: function( artistName ) {

	       return checkAlbumArt(artist);
	    }
	}
});