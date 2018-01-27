



( function() {
	var cssLoaded = {};

	function getName() {
		return CKEDITOR.skinName.split( ',' )[ 0 ];
	}

	function getConfigPath() {
		return CKEDITOR.getUrl( CKEDITOR.skinName.split( ',' )[ 1 ] || ( 'skins/' + getName() + '/' ) );
	}

	
	CKEDITOR.skin = {
		
		path: getConfigPath,

		
		loadPart: function( part, fn ) {
			if ( CKEDITOR.skin.name != getName() ) {
				CKEDITOR.scriptLoader.load( CKEDITOR.getUrl( getConfigPath() + 'skin.js' ), function() {
					loadCss( part, fn );
				} );
			} else {
				loadCss( part, fn );
			}
		},

		
		getPath: function( part ) {
			return CKEDITOR.getUrl( getCssPath( part ) );
		},

		
		icons: {},

		
		addIcon: function( name, path, offset, bgsize ) {
			name = name.toLowerCase();
			if ( !this.icons[ name ] ) {
				this.icons[ name ] = {
					path: path,
					offset: offset || 0,
					bgsize: bgsize || '16px'
				};
			}
		},

		
		getIconStyle: function( name, rtl, overridePath, overrideOffset, overrideBgsize ) {
			var icon, path, offset, bgsize;

			if ( name ) {
				name = name.toLowerCase();
				// If we're in RTL, try to get the RTL version of the icon.
				if ( rtl )
					icon = this.icons[ name + '-rtl' ];

				// If not in LTR or no RTL version available, get the generic one.
				if ( !icon )
					icon = this.icons[ name ];
			}

			path = overridePath || ( icon && icon.path ) || '';
			offset = overrideOffset || ( icon && icon.offset );
			bgsize = overrideBgsize || ( icon && icon.bgsize ) || '16px';

			// If we use apostrophes in background-image, we must escape apostrophes in path (just to be sure). (#13361)
			if ( path )
				path = path.replace( /'/g, '\\\'' );

			return path &&
				( 'background-image:url(\'' + CKEDITOR.getUrl( path ) + '\');background-position:0 ' + offset + 'px;background-size:' + bgsize + ';' );
		}
	};

	function getCssPath( part ) {
		// Check for ua-specific version of skin part.
		var uas = CKEDITOR.skin[ 'ua_' + part ], env = CKEDITOR.env;
		if ( uas ) {

			// Having versioned UA checked first.
			uas = uas.split( ',' ).sort( function( a, b ) {
				return a > b ? -1 : 1;
			} );

			// Loop through all ua entries, checking is any of them match the current ua.
			for ( var i = 0, ua; i < uas.length; i++ ) {
				ua = uas[ i ];

				if ( env.ie ) {
					if ( ( ua.replace( /^ie/, '' ) == env.version ) || ( env.quirks && ua == 'iequirks' ) )
						ua = 'ie';
				}

				if ( env[ ua ] ) {
					part += '_' + uas[ i ];
					break;
				}
			}
		}
		return CKEDITOR.getUrl( getConfigPath() + part + '.css' );
	}

	function loadCss( part, callback ) {
		// Avoid reload.
		if ( !cssLoaded[ part ] ) {
			CKEDITOR.document.appendStyleSheet( getCssPath( part ) );
			cssLoaded[ part ] = 1;
		}

		// CSS loading should not be blocking.
		callback && callback();
	}

	CKEDITOR.tools.extend( CKEDITOR.editor.prototype, {
		
		getUiColor: function() {
			return this.uiColor;
		},

		
		setUiColor: function( color ) {
			var uiStyle = getStylesheet( CKEDITOR.document );

			return ( this.setUiColor = function( color ) {
				this.uiColor = color;

				var chameleon = CKEDITOR.skin.chameleon,
					editorStyleContent = '',
					panelStyleContent = '';

				if ( typeof chameleon == 'function' ) {
					editorStyleContent = chameleon( this, 'editor' );
					panelStyleContent = chameleon( this, 'panel' );
				}

				var replace = [ [ uiColorRegexp, color ] ];

				// Update general style.
				updateStylesheets( [ uiStyle ], editorStyleContent, replace );

				// Update panel styles.
				updateStylesheets( uiColorMenus, panelStyleContent, replace );
			} ).call( this, color );
		}
	} );

	var uiColorStylesheetId = 'cke_ui_color',
		uiColorMenus = [],
		uiColorRegexp = /\$color/g;

	function getStylesheet( document ) {
		var node = document.getById( uiColorStylesheetId );
		if ( !node ) {
			node = document.getHead().append( 'style' );
			node.setAttribute( 'id', uiColorStylesheetId );
			node.setAttribute( 'type', 'text/css' );
		}
		return node;
	}

	function updateStylesheets( styleNodes, styleContent, replace ) {
		var r, i, content;

		// We have to split CSS declarations for webkit.
		if ( CKEDITOR.env.webkit ) {
			styleContent = styleContent.split( '}' ).slice( 0, -1 );
			for ( i = 0; i < styleContent.length; i++ )
				styleContent[ i ] = styleContent[ i ].split( '{' );
		}

		for ( var id = 0; id < styleNodes.length; id++ ) {
			if ( CKEDITOR.env.webkit ) {
				for ( i = 0; i < styleContent.length; i++ ) {
					content = styleContent[ i ][ 1 ];
					for ( r = 0; r < replace.length; r++ )
						content = content.replace( replace[ r ][ 0 ], replace[ r ][ 1 ] );

					styleNodes[ id ].$.sheet.addRule( styleContent[ i ][ 0 ], content );
				}
			} else {
				content = styleContent;
				for ( r = 0; r < replace.length; r++ )
					content = content.replace( replace[ r ][ 0 ], replace[ r ][ 1 ] );

				if ( CKEDITOR.env.ie && CKEDITOR.env.version < 11 )
					styleNodes[ id ].$.styleSheet.cssText += content;
				else
					styleNodes[ id ].$.innerHTML += content;
			}
		}
	}

	CKEDITOR.on( 'instanceLoaded', function( evt ) {
		// The chameleon feature is not for IE quirks.
		if ( CKEDITOR.env.ie && CKEDITOR.env.quirks )
			return;

		var editor = evt.editor,
			showCallback = function( event ) {
				var panel = event.data[ 0 ] || event.data;
				var iframe = panel.element.getElementsByTag( 'iframe' ).getItem( 0 ).getFrameDocument();

				// Add stylesheet if missing.
				if ( !iframe.getById( 'cke_ui_color' ) ) {
					var node = getStylesheet( iframe );
					uiColorMenus.push( node );

					var color = editor.getUiColor();
					// Set uiColor for new panel.
					if ( color )
						updateStylesheets( [ node ], CKEDITOR.skin.chameleon( editor, 'panel' ), [ [ uiColorRegexp, color ] ] );

				}
			};

		editor.on( 'panelShow', showCallback );
		editor.on( 'menuShow', showCallback );

		// Apply UI color if specified in config.
		if ( editor.config.uiColor )
			editor.setUiColor( editor.config.uiColor );
	} );
} )();








