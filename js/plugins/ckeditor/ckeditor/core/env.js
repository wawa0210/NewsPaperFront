



if ( !CKEDITOR.env ) {
	
	CKEDITOR.env = ( function() {
		var agent = navigator.userAgent.toLowerCase(),
			edge = agent.match( /edge[ \/](\d+.?\d*)/ ),
			trident = agent.indexOf( 'trident/' ) > -1,
			ie = !!( edge || trident );

		var env = {
			
			ie: ie,

			
			edge: !!edge,

			
			webkit: !ie && ( agent.indexOf( ' applewebkit/' ) > -1 ),

			
			air: ( agent.indexOf( ' adobeair/' ) > -1 ),

			
			mac: ( agent.indexOf( 'macintosh' ) > -1 ),

			
			quirks: ( document.compatMode == 'BackCompat' && ( !document.documentMode || document.documentMode < 10 ) ),

			
			mobile: ( agent.indexOf( 'mobile' ) > -1 ),

			
			iOS: /(ipad|iphone|ipod)/.test( agent ),

			
			isCustomDomain: function() {
				if ( !this.ie )
					return false;

				var domain = document.domain,
					hostname = window.location.hostname;

				return domain != hostname && domain != ( '[' + hostname + ']' ); // IPv6 IP support (#5434)
			},

			
			secure: location.protocol == 'https:'
		};

		
		env.gecko = ( navigator.product == 'Gecko' && !env.webkit && !env.ie );

		

		
		if ( env.webkit ) {
			if ( agent.indexOf( 'chrome' ) > -1 )
				env.chrome = true;
			else
				env.safari = true;
		}

		var version = 0;

		// Internet Explorer 6.0+
		if ( env.ie ) {
			// We use env.version for feature detection, so set it properly.
			if ( edge ) {
				version = parseFloat( edge[ 1 ] );
			} else if ( env.quirks || !document.documentMode ) {
				version = parseFloat( agent.match( /msie (\d+)/ )[ 1 ] );
			} else {
				version = document.documentMode;
			}

			// Deprecated features available just for backwards compatibility.
			env.ie9Compat = version == 9;
			env.ie8Compat = version == 8;
			env.ie7Compat = version == 7;
			env.ie6Compat = version < 7 || env.quirks;

			

			

			

			
		}

		// Gecko.
		if ( env.gecko ) {
			var geckoRelease = agent.match( /rv:([\d\.]+)/ );
			if ( geckoRelease ) {
				geckoRelease = geckoRelease[ 1 ].split( '.' );
				version = geckoRelease[ 0 ] * 10000 + ( geckoRelease[ 1 ] || 0 ) * 100 + ( geckoRelease[ 2 ] || 0 ) * 1;
			}
		}

		// Adobe AIR 1.0+
		// Checked before Safari because AIR have the WebKit rich text editor
		// features from Safari 3.0.4, but the version reported is 420.
		if ( env.air )
			version = parseFloat( agent.match( / adobeair\/(\d+)/ )[ 1 ] );

		// WebKit 522+ (Safari 3+)
		if ( env.webkit )
			version = parseFloat( agent.match( / applewebkit\/(\d+)/ )[ 1 ] );

		
		env.version = version;

		
		env.isCompatible =
			// IE 7+ (IE 7 is not supported, but IE Compat Mode is and it is recognized as IE7).
			!( env.ie && version < 7 ) &&
			// Firefox 4.0+.
			!( env.gecko && version < 40000 ) &&
			// Chrome 6+, Safari 5.1+, iOS 5+.
			!( env.webkit && version < 534 );

		
		env.hidpi = window.devicePixelRatio >= 2;

		
		env.needsBrFiller = env.gecko || env.webkit || ( env.ie && version > 10 );

		
		env.needsNbspFiller = env.ie && version < 11;

		
		env.cssClass = 'cke_browser_' + ( env.ie ? 'ie' : env.gecko ? 'gecko' : env.webkit ? 'webkit' : 'unknown' );

		if ( env.quirks )
			env.cssClass += ' cke_browser_quirks';

		if ( env.ie )
			env.cssClass += ' cke_browser_ie' + ( env.quirks ? '6 cke_browser_iequirks' : env.version );

		if ( env.air )
			env.cssClass += ' cke_browser_air';

		if ( env.iOS )
			env.cssClass += ' cke_browser_ios';

		if ( env.hidpi )
			env.cssClass += ' cke_hidpi';

		return env;
	} )();
}

// PACKAGER_RENAME( CKEDITOR.env )
// PACKAGER_RENAME( CKEDITOR.env.ie )
