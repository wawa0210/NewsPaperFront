

'use strict';

( function() {
	CKEDITOR.plugins.add( 'uploadwidget', {
		lang: 'en,zh-cn', // %REMOVE_LINE_CORE%
		requires: 'widget,clipboard,filetools,notificationaggregator',

		init: function( editor ) {
			// Images which should be changed into upload widget needs to be marked with `data-widget` on paste,
			// because otherwise wrong widget may handle upload placeholder element (e.g. image2 plugin would handle image).
			// `data-widget` attribute is allowed only in the elements which has also `data-cke-upload-id` attribute.
			editor.filter.allow( '*[!data-widget,!data-cke-upload-id]' );
		}
	} );

	
	function addUploadWidget( editor, name, def ) {
		var fileTools = CKEDITOR.fileTools,
			uploads = editor.uploadRepository,
			// Plugins which support all file type has lower priority than plugins which support specific types.
			priority = def.supportedTypes ? 10 : 20;

		if ( def.fileToElement ) {
			editor.on( 'paste', function( evt ) {
				var data = evt.data,
					dataTransfer = data.dataTransfer,
					filesCount = dataTransfer.getFilesCount(),
					loadMethod = def.loadMethod || 'loadAndUpload',
					file, i;

				if ( data.dataValue || !filesCount ) {
					return;
				}

				for ( i = 0; i < filesCount; i++ ) {
					file = dataTransfer.getFile( i );

					// No def.supportedTypes means all types are supported.
					if ( !def.supportedTypes || fileTools.isTypeSupported( file, def.supportedTypes ) ) {
						var el = def.fileToElement( file ),
							loader = uploads.create( file );

						if ( el ) {
							loader[ loadMethod ]( def.uploadUrl );

							CKEDITOR.fileTools.markElement( el, name, loader.id );

							if ( loadMethod == 'loadAndUpload' || loadMethod == 'upload' ) {
								CKEDITOR.fileTools.bindNotifications( editor, loader );
							}

							data.dataValue += el.getOuterHtml();
						}
					}
				}
			}, null, null, priority );
		}

		
		CKEDITOR.tools.extend( def, {
			
			downcast: function() {
				return new CKEDITOR.htmlParser.text( '' );
			},

			
			init: function() {
				var widget = this,
					id = this.wrapper.findOne( '[data-cke-upload-id]' ).data( 'cke-upload-id' ),
					loader = uploads.loaders[ id ],
					capitalize = CKEDITOR.tools.capitalize,
					oldStyle, newStyle;

				loader.on( 'update', function( evt ) {
					// Abort if widget was removed.
					if ( !widget.wrapper || !widget.wrapper.getParent() ) {
						if ( !editor.editable().find( '[data-cke-upload-id="' + id + '"]' ).count() ) {
							loader.abort();
						}
						evt.removeListener();
						return;
					}

					editor.fire( 'lockSnapshot' );

					// Call users method, eg. if the status is `uploaded` then
					// `onUploaded` method will be called, if exists.
					var methodName = 'on' + capitalize( loader.status );

					if ( typeof widget[ methodName ] === 'function' ) {
						if ( widget[ methodName ]( loader ) === false ) {
							editor.fire( 'unlockSnapshot' );
							return;
						}
					}

					// Set style to the wrapper if it still exists.
					newStyle = 'cke_upload_' + loader.status;
					if ( widget.wrapper && newStyle != oldStyle ) {
						oldStyle && widget.wrapper.removeClass( oldStyle );
						widget.wrapper.addClass( newStyle );
						oldStyle = newStyle;
					}

					// Remove widget on error or abort.
					if ( loader.status == 'error' || loader.status == 'abort' ) {
						editor.widgets.del( widget );
					}

					editor.fire( 'unlockSnapshot' );
				} );

				loader.update();
			},

			
			replaceWith: function( data, mode ) {
				if ( data.trim() === '' ) {
					editor.widgets.del( this );
					return;
				}

				var wasSelected = ( this == editor.widgets.focused ),
					editable = editor.editable(),
					range = editor.createRange(),
					bookmark, bookmarks;

				if ( !wasSelected ) {
					bookmarks = editor.getSelection().createBookmarks();
				}

				range.setStartBefore( this.wrapper );
				range.setEndAfter( this.wrapper );

				if ( wasSelected ) {
					bookmark = range.createBookmark();
				}

				editable.insertHtmlIntoRange( data, range, mode );

				editor.widgets.checkWidgets( { initOnlyNew: true } );

				// Ensure that old widgets instance will be removed.
				// If replaceWith is called in init, because of paste then checkWidgets will not remove it.
				editor.widgets.destroy( this, true );

				if ( wasSelected ) {
					range.moveToBookmark( bookmark );
					range.select();
				} else {
					editor.getSelection().selectBookmarks( bookmarks );
				}

			}

			

			

			

			

			

			

			

			

			

			
		} );

		editor.widgets.add( name, def );
	}

	
	function markElement( element, widgetName, loaderId  ) {
		element.setAttributes( {
			'data-cke-upload-id': loaderId,
			'data-widget': widgetName
		} );
	}

	
	function bindNotifications( editor, loader ) {
		var aggregator,
			task = null;

		loader.on( 'update', function() {
			// Value of uploadTotal is known after upload start. Task will be created when uploadTotal is present.
			if ( !task && loader.uploadTotal ) {
				createAggregator();
				task = aggregator.createTask( { weight: loader.uploadTotal } );
			}

			if ( task && loader.status == 'uploading' ) {
				task.update( loader.uploaded );
			}
		} );

		loader.on( 'uploaded', function() {
			task && task.done();
		} );

		loader.on( 'error', function() {
			task && task.cancel();
			editor.showNotification( loader.message, 'warning' );
		} );

		loader.on( 'abort', function() {
			task && task.cancel();
			editor.showNotification( editor.lang.uploadwidget.abort, 'info' );
		} );

		function createAggregator() {
			aggregator = editor._.uploadWidgetNotificaionAggregator;

			// Create one notification aggregator for all types of upload widgets for the editor.
			if ( !aggregator || aggregator.isFinished() ) {
				aggregator = editor._.uploadWidgetNotificaionAggregator = new CKEDITOR.plugins.notificationAggregator(
					editor, editor.lang.uploadwidget.uploadMany, editor.lang.uploadwidget.uploadOne );

				aggregator.once( 'finished', function() {
					var tasks = aggregator.getTaskCount();

					if ( tasks === 0 ) {
						aggregator.notification.hide();
					} else {
						aggregator.notification.update( {
							message: tasks == 1 ?
								editor.lang.uploadwidget.doneOne :
								editor.lang.uploadwidget.doneMany.replace( '%1', tasks ),
							type: 'success',
							important: 1
						} );
					}
				} );
			}
		}
	}

	// Two plugins extend this object.
	if ( !CKEDITOR.fileTools ) {
		CKEDITOR.fileTools = {};
	}

	CKEDITOR.tools.extend( CKEDITOR.fileTools, {
		addUploadWidget: addUploadWidget,
		markElement: markElement,
		bindNotifications: bindNotifications
	} );
} )();
