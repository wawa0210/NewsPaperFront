

CKEDITOR.plugins.add( 'format', {
	requires: 'richcombo',
	// jscs:disable maximumLineLength
	lang: 'en,zh-cn', // %REMOVE_LINE_CORE%
	// jscs:enable maximumLineLength
	init: function( editor ) {
		if ( editor.blockless )
			return;

		var config = editor.config,
			lang = editor.lang.format;

		// Gets the list of tags from the settings.
		var tags = config.format_tags.split( ';' );

		// Create style objects for all defined styles.
		var styles = {},
			stylesCount = 0,
			allowedContent = [];
		for ( var i = 0; i < tags.length; i++ ) {
			var tag = tags[ i ];
			var style = new CKEDITOR.style( config[ 'format_' + tag ] );
			if ( !editor.filter.customConfig || editor.filter.check( style ) ) {
				stylesCount++;
				styles[ tag ] = style;
				styles[ tag ]._.enterMode = editor.config.enterMode;
				allowedContent.push( style );
			}
		}

		// Hide entire combo when all formats are rejected.
		if ( stylesCount === 0 )
			return;

		editor.ui.addRichCombo( 'Format', {
			label: lang.label,
			title: lang.panelTitle,
			toolbar: 'styles,20',
			allowedContent: allowedContent,

			panel: {
				css: [ CKEDITOR.skin.getPath( 'editor' ) ].concat( config.contentsCss ),
				multiSelect: false,
				attributes: { 'aria-label': lang.panelTitle }
			},

			init: function() {
				this.startGroup( lang.panelTitle );

				for ( var tag in styles ) {
					var label = lang[ 'tag_' + tag ];

					// Add the tag entry to the panel list.
					this.add( tag, styles[ tag ].buildPreview( label ), label );
				}
			},

			onClick: function( value ) {
				editor.focus();
				editor.fire( 'saveSnapshot' );

				var style = styles[ value ],
					elementPath = editor.elementPath();

				editor[ style.checkActive( elementPath, editor ) ? 'removeStyle' : 'applyStyle' ]( style );

				// Save the undo snapshot after all changes are affected. (#4899)
				setTimeout( function() {
					editor.fire( 'saveSnapshot' );
				}, 0 );
			},

			onRender: function() {
				editor.on( 'selectionChange', function( ev ) {
					var currentTag = this.getValue(),
						elementPath = ev.data.path;

					this.refresh();

					for ( var tag in styles ) {
						if ( styles[ tag ].checkActive( elementPath, editor ) ) {
							if ( tag != currentTag )
								this.setValue( tag, editor.lang.format[ 'tag_' + tag ] );
							return;
						}
					}

					// If no styles match, just empty it.
					this.setValue( '' );

				}, this );
			},

			onOpen: function() {
				this.showAll();
				for ( var name in styles ) {
					var style = styles[ name ];

					// Check if that style is enabled in activeFilter.
					if ( !editor.activeFilter.check( style ) )
						this.hideItem( name );

				}
			},

			refresh: function() {
				var elementPath = editor.elementPath();

				if ( !elementPath )
						return;

				// Check if element path contains 'p' element.
				if ( !elementPath.isContextFor( 'p' ) ) {
					this.setState( CKEDITOR.TRISTATE_DISABLED );
					return;
				}

				// Check if there is any available style.
				for ( var name in styles ) {
					if ( editor.activeFilter.check( styles[ name ] ) )
						return;
				}
				this.setState( CKEDITOR.TRISTATE_DISABLED );
			}
		} );
	}
} );


CKEDITOR.config.format_tags = 'p;h1;h2;h3;h4;h5;h6;pre;address;div';


CKEDITOR.config.format_p = { element: 'p' };


CKEDITOR.config.format_div = { element: 'div' };


CKEDITOR.config.format_pre = { element: 'pre' };


CKEDITOR.config.format_address = { element: 'address' };


CKEDITOR.config.format_h1 = { element: 'h1' };


CKEDITOR.config.format_h2 = { element: 'h2' };


CKEDITOR.config.format_h3 = { element: 'h3' };


CKEDITOR.config.format_h4 = { element: 'h4' };


CKEDITOR.config.format_h5 = { element: 'h5' };


CKEDITOR.config.format_h6 = { element: 'h6' };
