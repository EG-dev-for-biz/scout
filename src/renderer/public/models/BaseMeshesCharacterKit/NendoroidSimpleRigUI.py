import bpy

Character_rig_id = "ml20200703"


######################
## Rig Properties ##
######################
class Rig_PT_customproperties(bpy.types.Panel):
    """Creates a Rig Properties Panel (Pose Bone Custom Properties)"""
    bl_category = "SimpleRigUI"
    bl_label = "Rig Properties"
    bl_idname = "UI_PT_customproperties"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_options = {'DEFAULT_CLOSED'}

    @classmethod
    def poll(self, context):
        if context.mode != 'POSE':
            return False

        try:
            return (context.active_object.type == 'ARMATURE')
        except (TypeError):
            return False

    def draw(self, context):
        layout = self.layout
        pose_bones = context.active_object.pose.bones
        try:
            selected_bones = [bone.name for bone in context.selected_pose_bones]
            selected_bones += [context.active_pose_bone.name]
        except (AttributeError, TypeError):
            return

        def assign_props(row, val, key):
            row.property = key
            row.data_path = "pose_bone"
            try:
                row.value = str(val)
            except:
                pass
        active_pose_bone = context.active_pose_bone

    # Iterate through selected bones add each prop property of each bone to the panel.

        for bone in context.selected_pose_bones:
            if len(bone.keys()) > 0:
                box = layout.box()
            for key in bone.keys():
                if key not in '_RNA_UI':
                    val = bone.get(key, "value")
                    row = box.row()
                    split = row.split(align=True, factor=0.3)
                    row = split.row(align=True)
                    row.label(text=key, translate=False)
                    row = split.row(align=True)
                    row.prop(bone, f'["{key}"]', text = "", slider=True)
                    
######################
## Rig Layer Panels ##
######################       
class RigLayer(bpy.types.Panel):
    bl_idname = "UI_PT_rig_layer"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'SimpleRigUI'
    bl_label = "Rig Layer"
    
    @classmethod
    def poll(self, context):
        try:
            return (context.active_object.data.get("Character_rig_id") == Character_rig_id)
        except (AttributeError, KeyError, TypeError):
            return False

    def draw(self, context):
        layout = self.layout
        row = layout.row()
        col = row.column(align=True)
        col.prop(context.active_object.data, 'layers', index=0, toggle=True, text='Head')
        col.prop(context.active_object.data, 'layers', index=1, toggle=True, text='Body(Main)')
        col.prop(context.active_object.data, 'layers', index=2, toggle=True, text='Body(Tweak)')

        
        row = layout.row()
        col = row.column(align=True)
        col.prop(context.active_object.data, 'layers', index=19, toggle=True, text='Arm R(FK)') 
        col.prop(context.active_object.data, 'layers', index=20, toggle=True, text='Arm R(IK)') 
        col.prop(context.active_object.data, 'layers', index=21, toggle=True, text='Arm R(Tweak)')
        col.prop(context.active_object.data, 'layers', index=22, toggle=True, text='Finger R') 
        
        col = row.column(align=True)
        col.prop(context.active_object.data, 'layers', index=3, toggle=True, text='Arm L(FK)') 
        col.prop(context.active_object.data, 'layers', index=4, toggle=True, text='Arm L(IK)') 
        col.prop(context.active_object.data, 'layers', index=5, toggle=True, text='Arm L(Tweak)')
        col.prop(context.active_object.data, 'layers', index=6, toggle=True, text='Finger L') 
        
        row = layout.row()        
        col = row.column(align=True)
        col.prop(context.active_object.data, 'layers', index=24, toggle=True, text='Leg R(FK)') 
        col.prop(context.active_object.data, 'layers', index=25, toggle=True, text='Leg R(IK)') 
        col.prop(context.active_object.data, 'layers', index=26, toggle=True, text='Leg R(Tweak)') 
        
        col = row.column(align=True)
        col.prop(context.active_object.data, 'layers', index=8, toggle=True, text='Leg L(FK)') 
        col.prop(context.active_object.data, 'layers', index=9, toggle=True, text='Leg L(IK)') 
        col.prop(context.active_object.data, 'layers', index=10, toggle=True, text='Leg L(Tweak)')
        
        row = layout.row()
        col = row.column(align=True)
        col.prop(context.active_object.data, 'layers', index=16, toggle=True, text='Root')                   


def register():
    bpy.utils.register_class(RigLayer)
    bpy.utils.register_class(Rig_PT_customproperties)


def unregister():
    bpy.utils.unregister_class(RigLayer)
    bpy.utils.unregister_class(Rig_PT_customproperties)



if __name__ == "__main__":
    register()