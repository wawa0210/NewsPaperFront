



'use strict';

( function() {
	var keystrokes = [
			CKEDITOR.CTRL + 90 ,
			CKEDITOR.CTRL + 89 ,
			CKEDITOR.CTRL + CKEDITOR.SHIFT + 90 
		],
		backspaceOrDelete = { 8: 1, 46: 1 };

	CKEDITOR.plugins.add( 'undo', {
		// jscs:disable maximumLineLength
		lang: 'en,zh-cn', // %REMOVE_LINE_CORE%
		// jscs:enable maximumLineLength
		icons: 'redo,redo-rtl,undo,undo-rtl', // %REMOVE_LINE_CORE%
		hidpi: true, // %REMOVE_LINE_CORE%
		init: function( editor ) {
			var undoManager = editor.undoManager = new UndoManager( editor ),
				editingHandler = undoManager.editingHandler = new NativeEditingHandler( undoManager );

			var undoCommand = editor.addCommand( 'undo', {
				exec: function() {
					if ( undoManager.undo() ) {
						editor.selectionChange();
						this.fire( 'afterUndo' );
					}
				},
				startDisabled: true,
				canUndo: false
			} );

			var redoCommand = editor.addCommand( 'redo', {
				exec: function() {
					if ( undoManager.redo() ) {
						editor.selectionChange();
						this.fire( 'afterRedo' );
					}
				},
				startDisabled: true,
				canUndo: false
			} );

			editor.setKeystroke( [
				[ keystrokes[ 0 ], 'undo' ],
				[ keystrokes[ 1 ], 'redo' ],
				[ keystrokes[ 2 ], 'redo' ]
			] );

			undoManager.onChange = function() {
				undoCommand.setState( undoManager.undoable() ? CKEDITOR.TRISTATE_OFF : CKEDITOR.TRISTATE_DISABLED );
				redoCommand.setState( undoManager.redoable() ? CKEDITOR.TRISTATE_OFF : CKEDITOR.TRISTATE_DISABLED );
			};

			function recordCommand( event ) {
				// If the command hasn't been marked to not support undo.
				if ( undoManager.enabled && event.data.command.canUndo !== false )
					undoManager.save();
			}

			// We'll save snapshots before and after executing a command.
			editor.on( 'beforeCommandExec', recordCommand );
			editor.on( 'afterCommandExec', recordCommand );

			// Save snapshots before doing custom changes.
			editor.on( 'saveSnapshot', function( evt ) {
				undoManager.save( evt.data && evt.data.contentOnly );
			} );

			// Event manager listeners should be attached on contentDom.
			editor.on( 'contentDom', editingHandler.attachListeners, editingHandler );

			editor.on( 'instanceReady', function() {
				// Saves initial snapshot.
				editor.fire( 'saveSnapshot' );
			} );

			// Always save an undo snapshot - the previous mode might have
			// changed editor contents.
			editor.on( 'beforeModeUnload', function() {
				editor.mode == 'wysiwyg' && undoManager.save( true );
			} );

			function toggleUndoManager() {
				undoManager.enabled = editor.readOnly ? false : editor.mode == 'wysiwyg';
				undoManager.onChange();
			}

			// Make the undo manager available only in wysiwyg mode.
			editor.on( 'mode', toggleUndoManager );

			// Disable undo manager when in read-only mode.
			editor.on( 'readOnly', toggleUndoManager );

			if ( editor.ui.addButton ) {
				editor.ui.addButton( 'Undo', {
					label: editor.lang.undo.undo,
					command: 'undo',
					toolbar: 'undo,10'
				} );

				editor.ui.addButton( 'Redo', {
					label: editor.lang.undo.redo,
					command: 'redo',
					toolbar: 'undo,20'
				} );
			}

			
			editor.resetUndo = function() {
				// Reset the undo stack.
				undoManager.reset();

				// Create the first image.
				editor.fire( 'saveSnapshot' );
			};

			
			editor.on( 'updateSnapshot', function() {
				if ( undoManager.currentImage )
					undoManager.update();
			} );

			
			editor.on( 'lockSnapshot', function( evt ) {
				var data = evt.data;
				undoManager.lock( data && data.dontUpdate, data && data.forceUpdate );
			} );

			
			editor.on( 'unlockSnapshot', undoManager.unlock, undoManager );
		}
	} );

	CKEDITOR.plugins.undo = {};

	
	var UndoManager = CKEDITOR.plugins.undo.UndoManager = function( editor ) {
		
		this.strokesRecorded = [ 0, 0 ];

		
		this.locked = null;

		
		this.previousKeyGroup = -1;

		
		this.limit = editor.config.undoStackSize || 20;

		
		this.strokesLimit = 25;

		this.editor = editor;

		// Reset the undo stack.
		this.reset();
	};

	UndoManager.prototype = {
		
		type: function( keyCode, strokesPerSnapshotExceeded ) {
			var keyGroup = UndoManager.getKeyGroup( keyCode ),
				// Count of keystrokes in current a row.
				// Note if strokesPerSnapshotExceeded will be exceeded, it'll be restarted.
				strokesRecorded = this.strokesRecorded[ keyGroup ] + 1;

			strokesPerSnapshotExceeded =
				( strokesPerSnapshotExceeded || strokesRecorded >= this.strokesLimit );

			if ( !this.typing )
				onTypingStart( this );

			if ( strokesPerSnapshotExceeded ) {
				// Reset the count of strokes, so it'll be later assigned to this.strokesRecorded.
				strokesRecorded = 0;

				this.editor.fire( 'saveSnapshot' );
			} else {
				// Fire change event.
				this.editor.fire( 'change' );
			}

			// Store recorded strokes count.
			this.strokesRecorded[ keyGroup ] = strokesRecorded;
			// This prop will tell in next itaration what kind of group was processed previously.
			this.previousKeyGroup = keyGroup;
		},

		
		keyGroupChanged: function( keyCode ) {
			return UndoManager.getKeyGroup( keyCode ) != this.previousKeyGroup;
		},

		
		reset: function() {
			// Stack for all the undo and redo snapshots, they're always created/removed
			// in consistency.
			this.snapshots = [];

			// Current snapshot history index.
			this.index = -1;

			this.currentImage = null;

			this.hasUndo = false;
			this.hasRedo = false;
			this.locked = null;

			this.resetType();
		},

		
		resetType: function() {
			this.strokesRecorded = [ 0, 0 ];
			this.typing = false;
			this.previousKeyGroup = -1;
		},

		
		refreshState: function() {
			// These lines can be handled within onChange() too.
			this.hasUndo = !!this.getNextImage( true );
			this.hasRedo = !!this.getNextImage( false );
			// Reset typing
			this.resetType();
			this.onChange();
		},

		
		save: function( onContentOnly, image, autoFireChange ) {
			var editor = this.editor;
			// Do not change snapshots stack when locked, editor is not ready,
			// editable is not ready or when editor is in mode difference than 'wysiwyg'.
			if ( this.locked || editor.status != 'ready' || editor.mode != 'wysiwyg' )
				return false;

			var editable = editor.editable();
			if ( !editable || editable.status != 'ready' )
				return false;

			var snapshots = this.snapshots;

			// Get a content image.
			if ( !image )
				image = new Image( editor );

			// Do nothing if it was not possible to retrieve an image.
			if ( image.contents === false )
				return false;

			// Check if this is a duplicate. In such case, do nothing.
			if ( this.currentImage ) {
				if ( image.equalsContent( this.currentImage ) ) {
					if ( onContentOnly )
						return false;

					if ( image.equalsSelection( this.currentImage ) )
						return false;
				} else if ( autoFireChange !== false ) {
					editor.fire( 'change' );
				}
			}

			// Drop future snapshots.
			snapshots.splice( this.index + 1, snapshots.length - this.index - 1 );

			// If we have reached the limit, remove the oldest one.
			if ( snapshots.length == this.limit )
				snapshots.shift();

			// Add the new image, updating the current index.
			this.index = snapshots.push( image ) - 1;

			this.currentImage = image;

			if ( autoFireChange !== false )
				this.refreshState();
			return true;
		},

		
		restoreImage: function( image ) {
			// Bring editor focused to restore selection.
			var editor = this.editor,
				sel;

			if ( image.bookmarks ) {
				editor.focus();
				// Retrieve the selection beforehand. (#8324)
				sel = editor.getSelection();
			}

			// Start transaction - do not allow any mutations to the
			// snapshots stack done when selecting bookmarks (much probably
			// by selectionChange listener).
			this.locked = { level: 999 };

			this.editor.loadSnapshot( image.contents );

			if ( image.bookmarks )
				sel.selectBookmarks( image.bookmarks );
			else if ( CKEDITOR.env.ie ) {
				// IE BUG: If I don't set the selection to *somewhere* after setting
				// document contents, then IE would create an empty paragraph at the bottom
				// the next time the document is modified.
				var $range = this.editor.document.getBody().$.createTextRange();
				$range.collapse( true );
				$range.select();
			}

			this.locked = null;

			this.index = image.index;
			this.currentImage = this.snapshots[ this.index ];

			// Update current image with the actual editor
			// content, since actualy content may differ from
			// the original snapshot due to dom change. (#4622)
			this.update();
			this.refreshState();

			editor.fire( 'change' );
		},

		
		getNextImage: function( isUndo ) {
			var snapshots = this.snapshots,
				currentImage = this.currentImage,
				image, i;

			if ( currentImage ) {
				if ( isUndo ) {
					for ( i = this.index - 1; i >= 0; i-- ) {
						image = snapshots[ i ];
						if ( !currentImage.equalsContent( image ) ) {
							image.index = i;
							return image;
						}
					}
				} else {
					for ( i = this.index + 1; i < snapshots.length; i++ ) {
						image = snapshots[ i ];
						if ( !currentImage.equalsContent( image ) ) {
							image.index = i;
							return image;
						}
					}
				}
			}

			return null;
		},

		
		redoable: function() {
			return this.enabled && this.hasRedo;
		},

		
		undoable: function() {
			return this.enabled && this.hasUndo;
		},

		
		undo: function() {
			if ( this.undoable() ) {
				this.save( true );

				var image = this.getNextImage( true );
				if ( image )
					return this.restoreImage( image ), true;
			}

			return false;
		},

		
		redo: function() {
			if ( this.redoable() ) {
				// Try to save. If no changes have been made, the redo stack
				// will not change, so it will still be redoable.
				this.save( true );

				// If instead we had changes, we can't redo anymore.
				if ( this.redoable() ) {
					var image = this.getNextImage( false );
					if ( image )
						return this.restoreImage( image ), true;
				}
			}

			return false;
		},

		
		update: function( newImage ) {
			// Do not change snapshots stack is locked.
			if ( this.locked )
				return;

			if ( !newImage )
				newImage = new Image( this.editor );

			var i = this.index,
				snapshots = this.snapshots;

			// Find all previous snapshots made for the same content (which differ
			// only by selection) and replace all of them with the current image.
			while ( i > 0 && this.currentImage.equalsContent( snapshots[ i - 1 ] ) )
				i -= 1;

			snapshots.splice( i, this.index - i + 1, newImage );
			this.index = i;
			this.currentImage = newImage;
		},

		
		updateSelection: function( newSnapshot ) {
			if ( !this.snapshots.length )
				return false;

			var snapshots = this.snapshots,
				lastImage = snapshots[ snapshots.length - 1 ];

			if ( lastImage.equalsContent( newSnapshot ) ) {
				if ( !lastImage.equalsSelection( newSnapshot ) ) {
					snapshots[ snapshots.length - 1 ] = newSnapshot;
					this.currentImage = newSnapshot;
					return true;
				}
			}

			return false;
		},

		
		lock: function( dontUpdate, forceUpdate ) {
			if ( !this.locked ) {
				if ( dontUpdate )
					this.locked = { level: 1 };
				else {
					var update = null;

					if ( forceUpdate )
						update = true;
					else {
						// Make a contents image. Don't include bookmarks, because:
						// * we don't compare them,
						// * there's a chance that DOM has been changed since
						// locked (e.g. fake) selection was made, so createBookmark2 could fail.
						// http://dev.ckeditor.com/ticket/11027#comment:3
						var imageBefore = new Image( this.editor, true );

						// If current editor content matches the tip of snapshot stack,
						// the stack tip must be updated by unlock, to include any changes made
						// during this period.
						if ( this.currentImage && this.currentImage.equalsContent( imageBefore ) )
							update = imageBefore;
					}

					this.locked = { update: update, level: 1 };
				}

			// Increase the level of lock.
			} else {
				this.locked.level++;
			}
		},

		
		unlock: function() {
			if ( this.locked ) {
				// Decrease level of lock and check if equals 0, what means that undoM is completely unlocked.
				if ( !--this.locked.level ) {
					var update = this.locked.update;

					this.locked = null;

					// forceUpdate was passed to lock().
					if ( update === true )
						this.update();
					// update is instance of Image.
					else if ( update ) {
						var newImage = new Image( this.editor, true );

						if ( !update.equalsContent( newImage ) )
							this.update();
					}
				}
			}
		}
	};

	
	UndoManager.navigationKeyCodes = {
		37: 1, 38: 1, 39: 1, 40: 1, // Arrows.
		36: 1, 35: 1, // Home, End.
		33: 1, 34: 1 // PgUp, PgDn.
	};

	
	UndoManager.keyGroups = {
		PRINTABLE: 0,
		FUNCTIONAL: 1
	};

	
	UndoManager.isNavigationKey = function( keyCode ) {
		return !!UndoManager.navigationKeyCodes[ keyCode ];
	};

	
	UndoManager.getKeyGroup = function( keyCode ) {
		var keyGroups = UndoManager.keyGroups;

		return backspaceOrDelete[ keyCode ] ? keyGroups.FUNCTIONAL : keyGroups.PRINTABLE;
	};

	
	UndoManager.getOppositeKeyGroup = function( keyGroup ) {
		var keyGroups = UndoManager.keyGroups;
		return ( keyGroup == keyGroups.FUNCTIONAL ? keyGroups.PRINTABLE : keyGroups.FUNCTIONAL );
	};

	
	UndoManager.ieFunctionalKeysBug = function( keyCode ) {
		return CKEDITOR.env.ie && UndoManager.getKeyGroup( keyCode ) == UndoManager.keyGroups.FUNCTIONAL;
	};

	// Helper method called when undoManager.typing val was changed to true.
	function onTypingStart( undoManager ) {
		// It's safe to now indicate typing state.
		undoManager.typing = true;

		// Manually mark snapshot as available.
		undoManager.hasUndo = true;
		undoManager.hasRedo = false;

		undoManager.onChange();
	}

	
	var Image = CKEDITOR.plugins.undo.Image = function( editor, contentsOnly ) {
			this.editor = editor;

			editor.fire( 'beforeUndoImage' );

			var contents = editor.getSnapshot();

			// In IE, we need to remove the expando attributes.
			if ( CKEDITOR.env.ie && contents )
				contents = contents.replace( /\s+data-cke-expando=".*?"/g, '' );

			this.contents = contents;

			if ( !contentsOnly ) {
				var selection = contents && editor.getSelection();
				this.bookmarks = selection && selection.createBookmarks2( true );
			}

			editor.fire( 'afterUndoImage' );
		};

	// Attributes that browser may changing them when setting via innerHTML.
	var protectedAttrs = /\b(?:href|src|name)="[^"]*?"/gi;

	Image.prototype = {
		
		equalsContent: function( otherImage ) {
			var thisContents = this.contents,
				otherContents = otherImage.contents;

			// For IE7 and IE QM: Comparing only the protected attribute values but not the original ones.(#4522)
			if ( CKEDITOR.env.ie && ( CKEDITOR.env.ie7Compat || CKEDITOR.env.quirks ) ) {
				thisContents = thisContents.replace( protectedAttrs, '' );
				otherContents = otherContents.replace( protectedAttrs, '' );
			}

			if ( thisContents != otherContents )
				return false;

			return true;
		},

		
		equalsSelection: function( otherImage ) {
			var bookmarksA = this.bookmarks,
				bookmarksB = otherImage.bookmarks;

			if ( bookmarksA || bookmarksB ) {
				if ( !bookmarksA || !bookmarksB || bookmarksA.length != bookmarksB.length )
					return false;

				for ( var i = 0; i < bookmarksA.length; i++ ) {
					var bookmarkA = bookmarksA[ i ],
						bookmarkB = bookmarksB[ i ];

					if ( bookmarkA.startOffset != bookmarkB.startOffset || bookmarkA.endOffset != bookmarkB.endOffset ||
						!CKEDITOR.tools.arrayCompare( bookmarkA.start, bookmarkB.start ) ||
						!CKEDITOR.tools.arrayCompare( bookmarkA.end, bookmarkB.end ) ) {
						return false;
					}
				}
			}

			return true;
		}

		

		
	};

	
	var NativeEditingHandler = CKEDITOR.plugins.undo.NativeEditingHandler = function( undoManager ) {
		// We'll use keyboard + input events to determine if snapshot should be created.
		// Since `input` event is fired before `keyup`. We can tell in `keyup` event if input occured.
		// That will tell us if any printable data was inserted.
		// On `input` event we'll increase input fired counter for proper key code.
		// Eventually it might be canceled by paste/drop using `ignoreInputEvent` flag.
		// Order of events can be found in http://www.w3.org/TR/DOM-Level-3-Events/

		
		this.undoManager = undoManager;

		
		this.ignoreInputEvent = false;

		
		this.keyEventsStack = new KeyEventsStack();

		
		this.lastKeydownImage = null;
	};

	NativeEditingHandler.prototype = {
		
		onKeydown: function( evt ) {
			var keyCode = evt.data.getKey();

			// The composition is in progress - ignore the key. (#12597)
			if ( keyCode === 229 ) {
				return;
			}

			// Block undo/redo keystrokes when at the bottom/top of the undo stack (#11126 and #11677).
			if ( CKEDITOR.tools.indexOf( keystrokes, evt.data.getKeystroke() ) > -1 ) {
				evt.data.preventDefault();
				return;
			}

			// Cleaning tab functional keys.
			this.keyEventsStack.cleanUp( evt );

			var undoManager = this.undoManager;

			// Gets last record for provided keyCode. If not found will create one.
			var last = this.keyEventsStack.getLast( keyCode );
			if ( !last ) {
				this.keyEventsStack.push( keyCode );
			}

			// We need to store an image which will be used in case of key group
			// change.
			this.lastKeydownImage = new Image( undoManager.editor );

			if ( UndoManager.isNavigationKey( keyCode ) || this.undoManager.keyGroupChanged( keyCode ) ) {
				if ( undoManager.strokesRecorded[ 0 ] || undoManager.strokesRecorded[ 1 ] ) {
					// We already have image, so we'd like to reuse it.

					// #12300
					undoManager.save( false, this.lastKeydownImage, false );
					undoManager.resetType();
				}
			}
		},

		
		onInput: function() {
			// Input event is ignored if paste/drop event were fired before.
			if ( this.ignoreInputEvent ) {
				// Reset flag - ignore only once.
				this.ignoreInputEvent = false;
				return;
			}

			var lastInput = this.keyEventsStack.getLast();
			// Nothing in key events stack, but input event called. Interesting...
			// That's because on Android order of events is buggy and also keyCode is set to 0.
			if ( !lastInput ) {
				lastInput = this.keyEventsStack.push( 0 );
			}

			// Increment inputs counter for provided key code.
			this.keyEventsStack.increment( lastInput.keyCode );

			// Exceeded limit.
			if ( this.keyEventsStack.getTotalInputs() >= this.undoManager.strokesLimit ) {
				this.undoManager.type( lastInput.keyCode, true );
				this.keyEventsStack.resetInputs();
			}
		},

		
		onKeyup: function( evt ) {
			var undoManager = this.undoManager,
				keyCode = evt.data.getKey(),
				totalInputs = this.keyEventsStack.getTotalInputs();

			// Remove record from stack for provided key code.
			this.keyEventsStack.remove( keyCode );

			// Second part of the workaround for IEs functional keys bug. We need to check whether something has really
			// changed because we blindly mocked the keypress event.
			// Also we need to be aware that lastKeydownImage might not be available (#12327).
			if ( UndoManager.ieFunctionalKeysBug( keyCode ) && this.lastKeydownImage &&
				this.lastKeydownImage.equalsContent( new Image( undoManager.editor, true ) ) ) {
				return;
			}

			if ( totalInputs > 0 ) {
				undoManager.type( keyCode );
			} else if ( UndoManager.isNavigationKey( keyCode ) ) {
				// Note content snapshot has been checked in keydown.
				this.onNavigationKey( true );
			}
		},

		
		onNavigationKey: function( skipContentCompare ) {
			var undoManager = this.undoManager;

			// We attempt to save content snapshot, if content didn't change, we'll
			// only amend selection.
			if ( skipContentCompare || !undoManager.save( true, null, false ) )
				undoManager.updateSelection( new Image( undoManager.editor ) );

			undoManager.resetType();
		},

		
		ignoreInputEventListener: function() {
			this.ignoreInputEvent = true;
		},

		
		attachListeners: function() {
			var editor = this.undoManager.editor,
				editable = editor.editable(),
				that = this;

			// We'll create a snapshot here (before DOM modification), because we'll
			// need unmodified content when we got keygroup toggled in keyup.
			editable.attachListener( editable, 'keydown', function( evt ) {
				that.onKeydown( evt );

				// On IE keypress isn't fired for functional (backspace/delete) keys.
				// Let's pretend that something's changed.
				if ( UndoManager.ieFunctionalKeysBug( evt.data.getKey() ) ) {
					that.onInput();
				}
			}, null, null, 999 );

			// Only IE can't use input event, because it's not fired in contenteditable.
			editable.attachListener( editable, ( CKEDITOR.env.ie ? 'keypress' : 'input' ), that.onInput, that, null, 999 );

			// Keyup executes main snapshot logic.
			editable.attachListener( editable, 'keyup', that.onKeyup, that, null, 999 );

			// On paste and drop we need to ignore input event.
			// It would result with calling undoManager.type() on any following key.
			editable.attachListener( editable, 'paste', that.ignoreInputEventListener, that, null, 999 );
			editable.attachListener( editable, 'drop', that.ignoreInputEventListener, that, null, 999 );

			// Click should create a snapshot if needed, but shouldn't cause change event.
			// Don't pass onNavigationKey directly as a listener because it accepts one argument which
			// will conflict with evt passed to listener.
			// #12324 comment:4
			editable.attachListener( editable.isInline() ? editable : editor.document.getDocumentElement(), 'click', function() {
				that.onNavigationKey();
			}, null, null, 999 );

			// When pressing `Tab` key while editable is focused, `keyup` event is not fired.
			// Which means that record for `tab` key stays in key events stack.
			// We assume that when editor is blurred `tab` key is already up.
			editable.attachListener( this.undoManager.editor, 'blur', function() {
				that.keyEventsStack.remove( 9  );
			}, null, null, 999 );
		}
	};

	
	var KeyEventsStack = CKEDITOR.plugins.undo.KeyEventsStack = function() {
		
		this.stack = [];
	};

	KeyEventsStack.prototype = {
		
		push: function( keyCode ) {
			var length = this.stack.push( { keyCode: keyCode, inputs: 0 } );
			return this.stack[ length - 1 ];
		},

		
		getLastIndex: function( keyCode ) {
			if ( typeof keyCode != 'number' ) {
				return this.stack.length - 1; // Last index or -1.
			} else {
				var i = this.stack.length;
				while ( i-- ) {
					if ( this.stack[ i ].keyCode == keyCode ) {
						return i;
					}
				}
				return -1;
			}
		},

		
		getLast: function( keyCode ) {
			var index = this.getLastIndex( keyCode );
			if ( index != -1 ) {
				return this.stack[ index ];
			} else {
				return null;
			}
		},

		
		increment: function( keyCode ) {
			var found = this.getLast( keyCode );
			if ( !found ) { // %REMOVE_LINE%
				throw new Error( 'Trying to increment, but could not found by keyCode: ' + keyCode + '.' ); // %REMOVE_LINE%
			} // %REMOVE_LINE%

			found.inputs++;
		},

		
		remove: function( keyCode ) {
			var index = this.getLastIndex( keyCode );

			if ( index != -1 ) {
				this.stack.splice( index, 1 );
			}
		},

		
		resetInputs: function( keyCode ) {
			if ( typeof keyCode == 'number' ) {
				var last = this.getLast( keyCode );

				if ( !last ) { // %REMOVE_LINE%
					throw new Error( 'Trying to reset inputs count, but could not found by keyCode: ' + keyCode + '.' ); // %REMOVE_LINE%
				} // %REMOVE_LINE%

				last.inputs = 0;
			} else {
				var i = this.stack.length;
				while ( i-- ) {
					this.stack[ i ].inputs = 0;
				}
			}
		},

		
		getTotalInputs: function() {
			var i = this.stack.length,
				total = 0;

			while ( i-- ) {
				total += this.stack[ i ].inputs;
			}
			return total;
		},

		
		cleanUp: function( event ) {
			var nativeEvent = event.data.$;

			if ( !( nativeEvent.ctrlKey || nativeEvent.metaKey ) ) {
				this.remove( 17 );
			}
			if ( !nativeEvent.shiftKey ) {
				this.remove( 16 );
			}
			if ( !nativeEvent.altKey ) {
				this.remove( 18 );
			}
		}
	};
} )();










