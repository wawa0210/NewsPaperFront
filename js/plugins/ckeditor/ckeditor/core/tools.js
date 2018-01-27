



( function() {
	var functions = [],
		cssVendorPrefix =
			CKEDITOR.env.gecko ? '-moz-' :
			CKEDITOR.env.webkit ? '-webkit-' :
			CKEDITOR.env.ie ? '-ms-' :
			'',
		ampRegex = /&/g,
		gtRegex = />/g,
		ltRegex = /</g,
		quoteRegex = /"/g,
		tokenCharset = 'abcdefghijklmnopqrstuvwxyz0123456789',
		TOKEN_COOKIE_NAME = 'ckCsrfToken',
		TOKEN_LENGTH = 40,

		allEscRegex = /&(lt|gt|amp|quot|nbsp|shy|#\d{1,5});/g,
		namedEntities = {
			lt: '<',
			gt: '>',
			amp: '&',
			quot: '"',
			nbsp: '\u00a0',
			shy: '\u00ad'
		},
		allEscDecode = function( match, code ) {
			if ( code[ 0 ] == '#' ) {
				return String.fromCharCode( parseInt( code.slice( 1 ), 10 ) );
			} else {
				return namedEntities[ code ];
			}
		};

	CKEDITOR.on( 'reset', function() {
		functions = [];
	} );

	
	CKEDITOR.tools = {
		
		arrayCompare: function( arrayA, arrayB ) {
			if ( !arrayA && !arrayB )
				return true;

			if ( !arrayA || !arrayB || arrayA.length != arrayB.length )
				return false;

			for ( var i = 0; i < arrayA.length; i++ ) {
				if ( arrayA[ i ] != arrayB[ i ] )
					return false;
			}

			return true;
		},

		
		getIndex: function( arr, compareFunction ) {
			for ( var i = 0; i < arr.length; ++i ) {
				if ( compareFunction( arr[ i ] ) )
					return i;
			}
			return -1;
		},

		
		clone: function( obj ) {
			var clone;

			// Array.
			if ( obj && ( obj instanceof Array ) ) {
				clone = [];

				for ( var i = 0; i < obj.length; i++ )
					clone[ i ] = CKEDITOR.tools.clone( obj[ i ] );

				return clone;
			}

			// "Static" types.
			if ( obj === null || ( typeof obj != 'object' ) || ( obj instanceof String ) || ( obj instanceof Number ) || ( obj instanceof Boolean ) || ( obj instanceof Date ) || ( obj instanceof RegExp ) )
				return obj;

			// DOM objects and window.
			if ( obj.nodeType || obj.window === obj )
				return obj;

			// Objects.
			clone = new obj.constructor();

			for ( var propertyName in obj ) {
				var property = obj[ propertyName ];
				clone[ propertyName ] = CKEDITOR.tools.clone( property );
			}

			return clone;
		},

		
		capitalize: function( str, keepCase ) {
			return str.charAt( 0 ).toUpperCase() + ( keepCase ? str.slice( 1 ) : str.slice( 1 ).toLowerCase() );
		},

		
		extend: function( target ) {
			var argsLength = arguments.length,
				overwrite, propertiesList;

			if ( typeof ( overwrite = arguments[ argsLength - 1 ] ) == 'boolean' )
				argsLength--;
			else if ( typeof ( overwrite = arguments[ argsLength - 2 ] ) == 'boolean' ) {
				propertiesList = arguments[ argsLength - 1 ];
				argsLength -= 2;
			}
			for ( var i = 1; i < argsLength; i++ ) {
				var source = arguments[ i ];
				for ( var propertyName in source ) {
					// Only copy existed fields if in overwrite mode.
					if ( overwrite === true || target[ propertyName ] == null ) {
						// Only copy  specified fields if list is provided.
						if ( !propertiesList || ( propertyName in propertiesList ) )
							target[ propertyName ] = source[ propertyName ];

					}
				}
			}

			return target;
		},

		
		prototypedCopy: function( source ) {
			var copy = function() {};
			copy.prototype = source;
			return new copy();
		},

		
		copy: function( source ) {
			var obj = {},
				name;

			for ( name in source )
				obj[ name ] = source[ name ];

			return obj;
		},

		
		isArray: function( object ) {
			return Object.prototype.toString.call( object ) == '[object Array]';
		},

		
		isEmpty: function( object ) {
			for ( var i in object ) {
				if ( object.hasOwnProperty( i ) )
					return false;
			}
			return true;
		},

		
		cssVendorPrefix: function( property, value, asString ) {
			if ( asString )
				return cssVendorPrefix + property + ':' + value + ';' + property + ':' + value;

			var ret = {};
			ret[ property ] = value;
			ret[ cssVendorPrefix + property ] = value;

			return ret;
		},

		
		cssStyleToDomStyle: ( function() {
			var test = document.createElement( 'div' ).style;

			var cssFloat = ( typeof test.cssFloat != 'undefined' ) ? 'cssFloat' : ( typeof test.styleFloat != 'undefined' ) ? 'styleFloat' : 'float';

			return function( cssName ) {
				if ( cssName == 'float' )
					return cssFloat;
				else {
					return cssName.replace( /-./g, function( match ) {
						return match.substr( 1 ).toUpperCase();
					} );
				}
			};
		} )(),

		
		buildStyleHtml: function( css ) {
			css = [].concat( css );
			var item,
				retval = [];
			for ( var i = 0; i < css.length; i++ ) {
				if ( ( item = css[ i ] ) ) {
					// Is CSS style text ?
					if ( /@import|[{}]/.test( item ) )
						retval.push( '<style>' + item + '</style>' );
					else
						retval.push( '<link type="text/css" rel=stylesheet href="' + item + '">' );
				}
			}
			return retval.join( '' );
		},

		
		htmlEncode: function( text ) {
			// Backwards compatibility - accept also non-string values (casting is done below).
			// Since 4.4.8 we return empty string for null and undefined because these values make no sense.
			if ( text === undefined || text === null ) {
				return '';
			}

			return String( text ).replace( ampRegex, '&amp;' ).replace( gtRegex, '&gt;' ).replace( ltRegex, '&lt;' );
		},

		
		htmlDecode: function( text ) {
			// See:
			// * http://dev.ckeditor.com/ticket/13105#comment:8 and comment:9,
			// * http://jsperf.com/wth-is-going-on-with-jsperf JSPerf has some serious problems, but you can observe
			// that combined regexp tends to be quicker (except on V8). It will also not be prone to fail on '&amp;lt;'
			// (see http://dev.ckeditor.com/ticket/13105#DXWTF:CKEDITOR.tools.htmlEnDecodeAttr).
			return text.replace( allEscRegex, allEscDecode );
		},

		
		htmlEncodeAttr: function( text ) {
			return CKEDITOR.tools.htmlEncode( text ).replace( quoteRegex, '&quot;' );
		},

		
		htmlDecodeAttr: function( text ) {
			return CKEDITOR.tools.htmlDecode( text );
		},

		
		transformPlainTextToHtml: function( text, enterMode ) {
			var isEnterBrMode = enterMode == CKEDITOR.ENTER_BR,
				// CRLF -> LF
				html = this.htmlEncode( text.replace( /\r\n/g, '\n' ) );

			// Tab -> &nbsp x 4;
			html = html.replace( /\t/g, '&nbsp;&nbsp; &nbsp;' );

			var paragraphTag = enterMode == CKEDITOR.ENTER_P ? 'p' : 'div';

			// Two line-breaks create one paragraphing block.
			if ( !isEnterBrMode ) {
				var duoLF = /\n{2}/g;
				if ( duoLF.test( html ) ) {
					var openTag = '<' + paragraphTag + '>', endTag = '</' + paragraphTag + '>';
					html = openTag + html.replace( duoLF, function() {
						return endTag + openTag;
					} ) + endTag;
				}
			}

			// One <br> per line-break.
			html = html.replace( /\n/g, '<br>' );

			// Compensate padding <br> at the end of block, avoid loosing them during insertion.
			if ( !isEnterBrMode ) {
				html = html.replace( new RegExp( '<br>(?=</' + paragraphTag + '>)' ), function( match ) {
					return CKEDITOR.tools.repeat( match, 2 );
				} );
			}

			// Preserve spaces at the ends, so they won't be lost after insertion (merged with adjacent ones).
			html = html.replace( /^ | $/g, '&nbsp;' );

			// Finally, preserve whitespaces that are to be lost.
			html = html.replace( /(>|\s) /g, function( match, before ) {
				return before + '&nbsp;';
			} ).replace( / (?=<)/g, '&nbsp;' );

			return html;
		},

		
		getNextNumber: ( function() {
			var last = 0;
			return function() {
				return ++last;
			};
		} )(),

		
		getNextId: function() {
			return 'cke_' + this.getNextNumber();
		},

		
		getUniqueId: function() {
			var uuid = 'e'; // Make sure that id does not start with number.
			for ( var i = 0; i < 8; i++ ) {
				uuid += Math.floor( ( 1 + Math.random() ) * 0x10000 ).toString( 16 ).substring( 1 );
			}
			return uuid;
		},

		
		override: function( originalFunction, functionBuilder ) {
			var newFn = functionBuilder( originalFunction );
			newFn.prototype = originalFunction.prototype;
			return newFn;
		},

		
		setTimeout: function( func, milliseconds, scope, args, ownerWindow ) {
			if ( !ownerWindow )
				ownerWindow = window;

			if ( !scope )
				scope = ownerWindow;

			return ownerWindow.setTimeout( function() {
				if ( args )
					func.apply( scope, [].concat( args ) );
				else
					func.apply( scope );
			}, milliseconds || 0 );
		},

		
		trim: ( function() {
			// We are not using \s because we don't want "non-breaking spaces" to be caught.
			var trimRegex = /(?:^[ \t\n\r]+)|(?:[ \t\n\r]+$)/g;
			return function( str ) {
				return str.replace( trimRegex, '' );
			};
		} )(),

		
		ltrim: ( function() {
			// We are not using \s because we don't want "non-breaking spaces" to be caught.
			var trimRegex = /^[ \t\n\r]+/g;
			return function( str ) {
				return str.replace( trimRegex, '' );
			};
		} )(),

		
		rtrim: ( function() {
			// We are not using \s because we don't want "non-breaking spaces" to be caught.
			var trimRegex = /[ \t\n\r]+$/g;
			return function( str ) {
				return str.replace( trimRegex, '' );
			};
		} )(),

		
		indexOf: function( array, value ) {
			if ( typeof value == 'function' ) {
				for ( var i = 0, len = array.length; i < len; i++ ) {
					if ( value( array[ i ] ) )
						return i;
				}
			} else if ( array.indexOf )
				return array.indexOf( value );
			else {
				for ( i = 0, len = array.length; i < len; i++ ) {
					if ( array[ i ] === value )
						return i;
				}
			}
			return -1;
		},

		
		search: function( array, value ) {
			var index = CKEDITOR.tools.indexOf( array, value );
			return index >= 0 ? array[ index ] : null;
		},

		
		bind: function( func, obj ) {
			return function() {
				return func.apply( obj, arguments );
			};
		},

		
		createClass: function( definition ) {
			var $ = definition.$,
				baseClass = definition.base,
				privates = definition.privates || definition._,
				proto = definition.proto,
				statics = definition.statics;

			// Create the constructor, if not present in the definition.
			!$ && ( $ = function() {
				baseClass && this.base.apply( this, arguments );
			} );

			if ( privates ) {
				var originalConstructor = $;
				$ = function() {
					// Create (and get) the private namespace.
					var _ = this._ || ( this._ = {} );

					// Make some magic so "this" will refer to the main
					// instance when coding private functions.
					for ( var privateName in privates ) {
						var priv = privates[ privateName ];

						_[ privateName ] = ( typeof priv == 'function' ) ? CKEDITOR.tools.bind( priv, this ) : priv;
					}

					originalConstructor.apply( this, arguments );
				};
			}

			if ( baseClass ) {
				$.prototype = this.prototypedCopy( baseClass.prototype );
				$.prototype.constructor = $;
				// Super references.
				$.base = baseClass;
				$.baseProto = baseClass.prototype;
				// Super constructor.
				$.prototype.base = function() {
					this.base = baseClass.prototype.base;
					baseClass.apply( this, arguments );
					this.base = arguments.callee;
				};
			}

			if ( proto )
				this.extend( $.prototype, proto, true );

			if ( statics )
				this.extend( $, statics, true );

			return $;
		},

		
		addFunction: function( fn, scope ) {
			return functions.push( function() {
				return fn.apply( scope || this, arguments );
			} ) - 1;
		},

		
		removeFunction: function( ref ) {
			functions[ ref ] = null;
		},

		
		callFunction: function( ref ) {
			var fn = functions[ ref ];
			return fn && fn.apply( window, Array.prototype.slice.call( arguments, 1 ) );
		},

		
		cssLength: ( function() {
			var pixelRegex = /^-?\d+\.?\d*px$/,
				lengthTrimmed;

			return function( length ) {
				lengthTrimmed = CKEDITOR.tools.trim( length + '' ) + 'px';

				if ( pixelRegex.test( lengthTrimmed ) )
					return lengthTrimmed;
				else
					return length || '';
			};
		} )(),

		
		convertToPx: ( function() {
			var calculator;

			return function( cssLength ) {
				if ( !calculator ) {
					calculator = CKEDITOR.dom.element.createFromHtml( '<div style="position:absolute;left:-9999px;' +
						'top:-9999px;margin:0px;padding:0px;border:0px;"' +
						'></div>', CKEDITOR.document );
					CKEDITOR.document.getBody().append( calculator );
				}

				if ( !( /%$/ ).test( cssLength ) ) {
					calculator.setStyle( 'width', cssLength );
					return calculator.$.clientWidth;
				}

				return cssLength;
			};
		} )(),

		
		repeat: function( str, times ) {
			return new Array( times + 1 ).join( str );
		},

		
		tryThese: function() {
			var returnValue;
			for ( var i = 0, length = arguments.length; i < length; i++ ) {
				var lambda = arguments[ i ];
				try {
					returnValue = lambda();
					break;
				} catch ( e ) {}
			}
			return returnValue;
		},

		
		genKey: function() {
			return Array.prototype.slice.call( arguments ).join( '-' );
		},

		
		defer: function( fn ) {
			return function() {
				var args = arguments,
					self = this;
				window.setTimeout( function() {
					fn.apply( self, args );
				}, 0 );
			};
		},

		
		normalizeCssText: function( styleText, nativeNormalize ) {
			var props = [],
				name,
				parsedProps = CKEDITOR.tools.parseCssText( styleText, true, nativeNormalize );

			for ( name in parsedProps )
				props.push( name + ':' + parsedProps[ name ] );

			props.sort();

			return props.length ? ( props.join( ';' ) + ';' ) : '';
		},

		
		convertRgbToHex: function( styleText ) {
			return styleText.replace( /(?:rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\))/gi, function( match, red, green, blue ) {
				var color = [ red, green, blue ];
				// Add padding zeros if the hex value is less than 0x10.
				for ( var i = 0; i < 3; i++ )
					color[ i ] = ( '0' + parseInt( color[ i ], 10 ).toString( 16 ) ).slice( -2 );
				return '#' + color.join( '' );
			} );
		},

		
		parseCssText: function( styleText, normalize, nativeNormalize ) {
			var retval = {};

			if ( nativeNormalize ) {
				// Injects the style in a temporary span object, so the browser parses it,
				// retrieving its final format.
				var temp = new CKEDITOR.dom.element( 'span' );
				temp.setAttribute( 'style', styleText );
				styleText = CKEDITOR.tools.convertRgbToHex( temp.getAttribute( 'style' ) || '' );
			}

			// IE will leave a single semicolon when failed to parse the style text. (#3891)
			if ( !styleText || styleText == ';' )
				return retval;

			styleText.replace( /&quot;/g, '"' ).replace( /\s*([^:;\s]+)\s*:\s*([^;]+)\s*(?=;|$)/g, function( match, name, value ) {
				if ( normalize ) {
					name = name.toLowerCase();
					// Normalize font-family property, ignore quotes and being case insensitive. (#7322)
					// http://www.w3.org/TR/css3-fonts/#font-family-the-font-family-property
					if ( name == 'font-family' )
						value = value.toLowerCase().replace( /["']/g, '' ).replace( /\s*,\s*/g, ',' );
					value = CKEDITOR.tools.trim( value );
				}

				retval[ name ] = value;
			} );
			return retval;
		},

		
		writeCssText: function( styles, sort ) {
			var name,
				stylesArr = [];

			for ( name in styles )
				stylesArr.push( name + ':' + styles[ name ] );

			if ( sort )
				stylesArr.sort();

			return stylesArr.join( '; ' );
		},

		
		objectCompare: function( left, right, onlyLeft ) {
			var name;

			if ( !left && !right )
				return true;
			if ( !left || !right )
				return false;

			for ( name in left ) {
				if ( left[ name ] != right[ name ] )
					return false;

			}

			if ( !onlyLeft ) {
				for ( name in right ) {
					if ( left[ name ] != right[ name ] )
						return false;
				}
			}

			return true;
		},

		
		objectKeys: function( obj ) {
			var keys = [];
			for ( var i in obj )
				keys.push( i );

			return keys;
		},

		
		convertArrayToObject: function( arr, fillWith ) {
			var obj = {};

			if ( arguments.length == 1 )
				fillWith = true;

			for ( var i = 0, l = arr.length; i < l; ++i )
				obj[ arr[ i ] ] = fillWith;

			return obj;
		},

		
		fixDomain: function() {
			var domain;

			while ( 1 ) {
				try {
					// Try to access the parent document. It throws
					// "access denied" if restricted by the "Same Origin" policy.
					domain = window.parent.document.domain;
					break;
				} catch ( e ) {
					// Calculate the value to set to document.domain.
					domain = domain ?

						// If it is not the first pass, strip one part of the
						// name. E.g.  "test.example.com"  => "example.com"
						domain.replace( /.+?(?:\.|$)/, '' ) :

						// In the first pass, we'll handle the
						// "document.domain = document.domain" case.
						document.domain;

					// Stop here if there is no more domain parts available.
					if ( !domain )
						break;

					document.domain = domain;
				}
			}

			return !!domain;
		},

		
		eventsBuffer: function( minInterval, output, scopeObj ) {
			var scheduled,
				lastOutput = 0;

			function triggerOutput() {
				lastOutput = ( new Date() ).getTime();
				scheduled = false;
				if ( scopeObj ) {
					output.call( scopeObj );
				} else {
					output();
				}
			}

			return {
				input: function() {
					if ( scheduled )
						return;

					var diff = ( new Date() ).getTime() - lastOutput;

					// If less than minInterval passed after last check,
					// schedule next for minInterval after previous one.
					if ( diff < minInterval )
						scheduled = setTimeout( triggerOutput, minInterval - diff );
					else
						triggerOutput();
				},

				reset: function() {
					if ( scheduled )
						clearTimeout( scheduled );

					scheduled = lastOutput = 0;
				}
			};
		},

		
		enableHtml5Elements: function( doc, withAppend ) {
			var els = 'abbr,article,aside,audio,bdi,canvas,data,datalist,details,figcaption,figure,footer,header,hgroup,main,mark,meter,nav,output,progress,section,summary,time,video'.split( ',' ),
				i = els.length,
				el;

			while ( i-- ) {
				el = doc.createElement( els[ i ] );
				if ( withAppend )
					doc.appendChild( el );
			}
		},

		
		checkIfAnyArrayItemMatches: function( arr, regexp ) {
			for ( var i = 0, l = arr.length; i < l; ++i ) {
				if ( arr[ i ].match( regexp ) )
					return true;
			}
			return false;
		},

		
		checkIfAnyObjectPropertyMatches: function( obj, regexp ) {
			for ( var i in obj ) {
				if ( i.match( regexp ) )
					return true;
			}
			return false;
		},

		
		transparentImageData: 'data:image/gif;base64,R0lGODlhAQABAPABAP///wAAACH5BAEKAAAALAAAAAABAAEAAAICRAEAOw==',


		
		getCookie: function( name ) {
			name = name.toLowerCase();
			var parts = document.cookie.split( ';' );
			var pair, key;

			for ( var i = 0; i < parts.length; i++ ) {
				pair = parts[ i ].split( '=' );
				key = decodeURIComponent( CKEDITOR.tools.trim( pair[ 0 ] ).toLowerCase() );

				if ( key === name ) {
					return decodeURIComponent( pair.length > 1 ? pair[ 1 ] : '' );
				}
			}

			return null;
		},

		
		setCookie: function( name, value ) {
			document.cookie = encodeURIComponent( name ) + '=' + encodeURIComponent( value ) + ';path=/';
		},

		
		getCsrfToken: function() {
			var token = CKEDITOR.tools.getCookie( TOKEN_COOKIE_NAME );

			if ( !token || token.length != TOKEN_LENGTH ) {
				token = generateToken( TOKEN_LENGTH );
				CKEDITOR.tools.setCookie( TOKEN_COOKIE_NAME, token );
			}

			return token;
		}
	};

	// Generates a CSRF token with a given length.
	//
	// @since 4.5.6
	// @param {Number} length
	// @returns {string}
	function generateToken( length ) {
		var randValues = [];
		var result = '';

		if ( window.crypto && window.crypto.getRandomValues ) {
			randValues = new Uint8Array( length );
			window.crypto.getRandomValues( randValues );
		} else {
			for ( var i = 0; i < length; i++ ) {
				randValues.push( Math.floor( Math.random() * 256 ) );
			}
		}

		for ( var j = 0; j < randValues.length; j++ ) {
			var character = tokenCharset.charAt( randValues[ j ] % tokenCharset.length );
			result += Math.random() > 0.5 ? character.toUpperCase() : character;
		}

		return result;
	}
} )();

// PACKAGER_RENAME( CKEDITOR.tools )
