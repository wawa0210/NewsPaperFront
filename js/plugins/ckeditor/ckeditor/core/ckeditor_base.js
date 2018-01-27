



// #### Compressed Code
// Compressed code in ckeditor.js must be be updated on changes in the script.
// The Closure Compiler online service should be used when updating this manually:
// http://closure-compiler.appspot.com/

// #### Raw code
// ATTENTION: read the above "Compressed Code" notes when changing this code.

if ( !window.CKEDITOR ) {
	
	window.CKEDITOR = ( function() {
		var basePathSrcPattern = /(^|.*[\\\/])ckeditor\.js(?:\?.*|;.*)?$/i;

		var CKEDITOR = {

			
			timestamp: '',				// %REMOVE_LINE%
			

			
			version: '%VERSION%',

			
			revision: '%REV%',

			
			rnd: Math.floor( Math.random() * ( 999  - 100  + 1 ) ) + 100 ,

			
			_: {
				pending: [],
				basePathSrcPattern: basePathSrcPattern
			},

			
			status: 'unloaded',

			
			basePath: ( function() {
				// Find out the editor directory path, based on its <script> tag.
				var path = window.CKEDITOR_BASEPATH || '';

				if ( !path ) {
					var scripts = document.getElementsByTagName( 'script' );

					for ( var i = 0; i < scripts.length; i++ ) {
						var match = scripts[ i ].src.match( basePathSrcPattern );

						if ( match ) {
							path = match[ 1 ];
							break;
						}
					}
				}

				// In IE (only) the script.src string is the raw value entered in the
				// HTML source. Other browsers return the full resolved URL instead.
				if ( path.indexOf( ':/' ) == -1 && path.slice( 0, 2 ) != '//' ) {
					// Absolute path.
					if ( path.indexOf( '/' ) === 0 )
						path = location.href.match( /^.*?:\/\/[^\/]*/ )[ 0 ] + path;
					// Relative path.
					else
						path = location.href.match( /^[^\?]*\/(?:)/ )[ 0 ] + path;
				}

				if ( !path )
					throw 'The CKEditor installation path could not be automatically detected. Please set the global variable "CKEDITOR_BASEPATH" before creating editor instances.';

				return path;
			} )(),

			
			getUrl: function( resource ) {
				// If this is not a full or absolute path.
				if ( resource.indexOf( ':/' ) == -1 && resource.indexOf( '/' ) !== 0 )
					resource = this.basePath + resource;

				// Add the timestamp, except for directories.
				if ( this.timestamp && resource.charAt( resource.length - 1 ) != '/' && !( /[&?]t=/ ).test( resource ) )
					resource += ( resource.indexOf( '?' ) >= 0 ? '&' : '?' ) + 't=' + this.timestamp;

				return resource;
			},

			
			domReady: ( function() {
				// Based on the original jQuery code (available under the MIT license, see LICENSE.md).

				var callbacks = [];

				function onReady() {
					try {
						// Cleanup functions for the document ready method
						if ( document.addEventListener ) {
							document.removeEventListener( 'DOMContentLoaded', onReady, false );
							executeCallbacks();
						}
						// Make sure body exists, at least, in case IE gets a little overzealous.
						else if ( document.attachEvent && document.readyState === 'complete' ) {
							document.detachEvent( 'onreadystatechange', onReady );
							executeCallbacks();
						}
					} catch ( er ) {}
				}

				function executeCallbacks() {
					var i;
					while ( ( i = callbacks.shift() ) )
						i();
				}

				return function( fn ) {
					callbacks.push( fn );

					// Catch cases where this is called after the
					// browser event has already occurred.
					if ( document.readyState === 'complete' )
						// Handle it asynchronously to allow scripts the opportunity to delay ready
						setTimeout( onReady, 1 );

					// Run below once on demand only.
					if ( callbacks.length != 1 )
						return;

					// For IE>8, Firefox, Opera and Webkit.
					if ( document.addEventListener ) {
						// Use the handy event callback
						document.addEventListener( 'DOMContentLoaded', onReady, false );

						// A fallback to window.onload, that will always work
						window.addEventListener( 'load', onReady, false );

					}
					// If old IE event model is used
					else if ( document.attachEvent ) {
						// ensure firing before onload,
						// maybe late but safe also for iframes
						document.attachEvent( 'onreadystatechange', onReady );

						// A fallback to window.onload, that will always work
						window.attachEvent( 'onload', onReady );

						// If IE and not a frame
						// continually check to see if the document is ready
						// use the trick by Diego Perini
						// http://javascript.nwbox.com/IEContentLoaded/
						var toplevel = false;

						try {
							toplevel = !window.frameElement;
						} catch ( e ) {}

						if ( document.documentElement.doScroll && toplevel ) {
							scrollCheck();
						}
					}

					function scrollCheck() {
						try {
							document.documentElement.doScroll( 'left' );
						} catch ( e ) {
							setTimeout( scrollCheck, 1 );
							return;
						}
						onReady();
					}
				};

			} )()
		};

		// Make it possible to override the "url" function with a custom
		// implementation pointing to a global named CKEDITOR_GETURL.
		var newGetUrl = window.CKEDITOR_GETURL;
		if ( newGetUrl ) {
			var originalGetUrl = CKEDITOR.getUrl;
			CKEDITOR.getUrl = function( resource ) {
				return newGetUrl.call( CKEDITOR, resource ) || originalGetUrl.call( CKEDITOR, resource );
			};
		}

		return CKEDITOR;
	} )();
}



// PACKAGER_RENAME( CKEDITOR )
