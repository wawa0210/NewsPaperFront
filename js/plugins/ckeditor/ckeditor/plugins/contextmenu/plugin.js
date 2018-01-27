

CKEDITOR.plugins.add( 'contextmenu', {
	requires: 'menu',

	// jscs:disable maximumLineLength
	lang: 'en,zh-cn', // %REMOVE_LINE_CORE%
	// jscs:enable maximumLineLength

	// Make sure the base class (CKEDITOR.menu) is loaded before it (#3318).
	onLoad: function() {
		
		CKEDITOR.plugins.contextMenu = CKEDITOR.tools.createClass( {
			base: CKEDITOR.menu,

			
			$: function( editor ) {
				this.base.call( this, editor, {
					panel: {
						className: 'cke_menu_panel',
						attributes: {
							'aria-label': editor.lang.contextmenu.options
						}
					}
				} );
			},

			proto: {
				
				addTarget: function( element, nativeContextMenuOnCtrl ) {
					element.on( 'contextmenu', function( event ) {
						var domEvent = event.data,
							isCtrlKeyDown =
								// Safari on Windows always show 'ctrlKey' as true in 'contextmenu' event,
								// which make this property unreliable. (#4826)
								( CKEDITOR.env.webkit ? holdCtrlKey : ( CKEDITOR.env.mac ? domEvent.$.metaKey : domEvent.$.ctrlKey ) );

						if ( nativeContextMenuOnCtrl && isCtrlKeyDown )
							return;

						// Cancel the browser context menu.
						domEvent.preventDefault();

						// Fix selection when non-editable element in Webkit/Blink (Mac) (#11306).
						if ( CKEDITOR.env.mac && CKEDITOR.env.webkit ) {
							var editor = this.editor,
								contentEditableParent = new CKEDITOR.dom.elementPath( domEvent.getTarget(), editor.editable() ).contains( function( el ) {
									// Return when non-editable or nested editable element is found.
									return el.hasAttribute( 'contenteditable' );
								}, true ); // Exclude editor's editable.

							// Fake selection for non-editables only (to exclude nested editables).
							if ( contentEditableParent && contentEditableParent.getAttribute( 'contenteditable' ) == 'false' )
								editor.getSelection().fake( contentEditableParent );
						}

						var doc = domEvent.getTarget().getDocument(),
							offsetParent = domEvent.getTarget().getDocument().getDocumentElement(),
							fromFrame = !doc.equals( CKEDITOR.document ),
							scroll = doc.getWindow().getScrollPosition(),
							offsetX = fromFrame ? domEvent.$.clientX : domEvent.$.pageX || scroll.x + domEvent.$.clientX,
							offsetY = fromFrame ? domEvent.$.clientY : domEvent.$.pageY || scroll.y + domEvent.$.clientY;

						CKEDITOR.tools.setTimeout( function() {
							this.open( offsetParent, null, offsetX, offsetY );

							// IE needs a short while to allow selection change before opening menu. (#7908)
						}, CKEDITOR.env.ie ? 200 : 0, this );
					}, this );

					if ( CKEDITOR.env.webkit ) {
						var holdCtrlKey,
							onKeyDown = function( event ) {
								holdCtrlKey = CKEDITOR.env.mac ? event.data.$.metaKey : event.data.$.ctrlKey;
							},
							resetOnKeyUp = function() {
								holdCtrlKey = 0;
							};

						element.on( 'keydown', onKeyDown );
						element.on( 'keyup', resetOnKeyUp );
						element.on( 'contextmenu', resetOnKeyUp );
					}
				},

				
				open: function( offsetParent, corner, offsetX, offsetY ) {
					this.editor.focus();
					offsetParent = offsetParent || CKEDITOR.document.getDocumentElement();

					// #9362: Force selection check to update commands' states in the new context.
					this.editor.selectionChange( 1 );

					this.show( offsetParent, corner, offsetX, offsetY );
				}
			}
		} );
	},

	beforeInit: function( editor ) {
		
		var contextMenu = editor.contextMenu = new CKEDITOR.plugins.contextMenu( editor );

		editor.on( 'contentDom', function() {
			contextMenu.addTarget( editor.editable(), editor.config.browserContextMenuOnCtrl !== false );
		} );

		editor.addCommand( 'contextMenu', {
			exec: function() {
				editor.contextMenu.open( editor.document.getBody() );
			}
		} );

		editor.setKeystroke( CKEDITOR.SHIFT + 121 , 'contextMenu' );
		editor.setKeystroke( CKEDITOR.CTRL + CKEDITOR.SHIFT + 121 , 'contextMenu' );
	}
} );


